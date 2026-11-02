import type { AudioPlace, LocalState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import {
  addTo,
  cardStateOf,
  type ChainPlan,
  moveTo,
  moveWithin,
  offersFor,
  PLACES,
  removeFrom,
  setOn,
  slotOf,
  switchModel,
} from "../model/rack.ts";
import type { Writer } from "../model/queue.ts";
import { nameOf } from "./card.ts";
import { type ChainData, chainData, shapeOf } from "./chain-data.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { effectBrowser, readRecent, rememberRecent } from "./effect-browser.ts";
import { effectSettings, gateSettings } from "./effect-settings.ts";
import { renderGate } from "./gate.ts";
import { type Levels, renderLevels } from "./levels.ts";
import { openPop, type Pop } from "./popover.ts";
import {
  renderRouting,
  type Routing,
  type RoutingHandlers,
} from "./routing.ts";

const popStateOf = (
  key: string,
  id: string,
  local: Pick<LocalState, "chosenEffects">,
): string => `${key}:${String(local.chosenEffects.includes(id))}`;

const storageOf = (doc: Document): Storage | null => {
  try {
    return doc.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Writes a plan in order: where things go, then what runs. */
export function runPlan(
  ctx: MixerContext,
  writes: Writer,
  key: string,
  plan: ChainPlan | null,
): void {
  if (!plan) return;
  void writes.run(key, async () => {
    if (Object.keys(plan.change).length)
      await ctx.api.commands.setAudioPipeline(plan.change);
    for (const [id, on] of plan.enable)
      await ctx.api.commands.setEffectEnabled(id, on);
  });
}

interface Drawn {
  data: ChainData;
  shape: string;
  routing: Routing | null;
  levels: Levels | null;
}

/** The player's own chain: routing above, levels below, both live. */
export function renderChain(
  ctx: MixerContext,
  doc: Document,
  writes: Writer,
): Rendered {
  const slot = el("div", { doc, className: "mav-mixer-chain" });
  const gate = renderGate(ctx, doc, (anchor) => {
    show({ kind: "gate", key: "gate", anchor });
  });
  /** What the open settings pop-up was drawn for. */
  let popState = "";
  const drawn: Drawn = {
    data: current(),
    shape: "",
    routing: null,
    levels: null,
  };
  let selected: string | null = null;
  let pop: Pop | null = null;
  /** The card that should have the keyboard after the next redraw. */
  let pending: string | null = null;

  function current(): ChainData {
    return chainData(
      ctx.api.effects.list(),
      ctx.api.state.get().local,
      ctx.layers?.held() ?? null,
      ctx.layers?.states() ?? [],
    );
  }

  const run = (key: string, plan: ChainPlan | null): void => {
    runPlan(ctx, writes, key, plan);
  };

  const markSelected = (): void => {
    for (const card of slot.querySelectorAll<HTMLElement>("[data-key]"))
      if (card.dataset.key === selected)
        card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    for (const fader of slot.querySelectorAll<HTMLElement>("[data-fader]"))
      fader.toggleAttribute("data-selected", fader.dataset.fader === selected);
  };

  const select = (key: string): void => {
    selected = key;
    markSelected();
  };

  const handlers: RoutingHandlers = {
    select,
    toggle(key) {
      const found = slotOf(drawn.data.racks, key);
      if (!found) return;
      const on = drawn.data.local.chosenEffects.includes(found.effect.id);
      pending = key;
      run(`on:${key}`, setOn(drawn.data.racks, key, !on));
    },
    remove(key) {
      pop?.close(false);
      run(`remove:${key}`, removeFrom(drawn.data.racks, key));
    },
    move(key, by) {
      pending = key;
      run(`order:${key}`, moveWithin(drawn.data.racks, key, by));
    },
    shift(key, by) {
      const found = slotOf(drawn.data.racks, key);
      const place = found && PLACES[PLACES.indexOf(found.place) + by];
      if (!place) return;
      pending = key;
      run(`place:${key}`, moveTo(drawn.data.racks, key, place));
    },
    drop(key, place, index) {
      pending = key;
      run(`place:${key}`, moveTo(drawn.data.racks, key, place, index));
    },
    settings(key, anchor) {
      select(key);
      show({ kind: "settings", key, anchor });
    },
    add(place, anchor) {
      show({ kind: "browser", key: place, anchor });
    },
    toLevel(key) {
      const found = slotOf(drawn.data.racks, key);
      const fader = found
        ? slot.querySelector<HTMLElement>(
            `[data-field="mix.${found.effect.id}"]`,
          )
        : null;
      select(key);
      fader?.focus();
    },
  };

  function show(spec: {
    kind: string;
    key: string;
    anchor: HTMLElement;
  }): Pop | null {
    pop?.close(false);
    const { data } = drawn;
    const found = slotOf(data.racks, spec.key);
    popState =
      spec.kind === "settings" && found
        ? popStateOf(found.key, found.effect.id, data.local)
        : "";
    const title =
      spec.kind === "gate"
        ? ctx.t("gate")
        : spec.kind === "browser"
          ? ctx.t(`addTo.${spec.key}`)
          : found
            ? nameOf(ctx, found)
            : "";
    if (spec.kind === "settings" && !found) return null;
    pop = openPop(ctx, doc, slot, {
      ...spec,
      title,
      onClosed: () => {
        pop = null;
      },
      build: (close) => {
        if (spec.kind === "gate") return gateSettings(ctx, doc, writes);
        if (spec.kind === "browser") {
          const place = spec.key as AudioPlace;
          const offers = offersFor(
            data.definitions,
            data.local,
            data.racks,
            place,
            readRecent(storageOf(doc)),
          );
          return effectBrowser(ctx, doc, place, offers, (offer) => {
            rememberRecent(storageOf(doc), offer.key);
            pending = offer.key;
            close();
            run(`add:${offer.key}`, addTo(data.racks, offer.effect, place));
          });
        }
        if (!found) throw new Error("No card to set");
        return effectSettings(ctx, doc, data, found, writes, {
          place: (key, place) => {
            run(`place:${key}`, moveTo(drawn.data.racks, key, place));
          },
          toggle: (key) => {
            handlers.toggle(key);
          },
          remove: (key) => {
            handlers.remove(key);
          },
          model: (id) => {
            run("model", switchModel(drawn.data.racks, id, drawn.data.local));
          },
        });
      },
    });
    return pop;
  }

  const draw = (): void => {
    const active = doc.activeElement as HTMLElement | null;
    const focusedKey =
      pending ??
      (slot.contains(active) && active?.dataset.key
        ? active.dataset.key
        : null);
    const field =
      slot.contains(active) && !active?.dataset.key
        ? active?.dataset.field
        : undefined;
    const reopen = pop?.kind === "settings" ? pop.key : null;
    const inPop = pop?.element.contains(active) ?? false;
    pop?.close(false);
    const { data } = drawn;
    const routing = renderRouting(ctx, doc, data, gate.element, handlers);
    const levels = renderLevels(ctx, doc, data, {
      mix: (effect, level) => {
        void writes.run(`mix:${effect}`, () =>
          ctx.api.commands.setAudioEffectMix(effect, level),
        );
      },
      channel: (level) => {
        void writes.run("channel", () =>
          ctx.api.commands.setAudioChannelLevel(level),
        );
      },
      cutTails: (on) => {
        void writes.run("cutTails", () =>
          ctx.api.commands.setAudioCutTails(on),
        );
      },
      select,
    });
    slot.replaceChildren(routing.element, levels.element);
    drawn.routing = routing;
    drawn.levels = levels;
    markSelected();
    const byField = (name: string | undefined): HTMLElement | null =>
      name ? slot.querySelector<HTMLElement>(`[data-field="${name}"]`) : null;
    if (focusedKey) routing.focus(focusedKey);
    else if (!inPop) byField(field)?.focus();
    pending = null;
    const anchor = byField(reopen ? `settings.${reopen}` : undefined);
    if (reopen && anchor) {
      show({ kind: "settings", key: reopen, anchor });
      if (inPop) byField(field)?.focus();
    }
  };

  const showValues = (local: LocalState): void => {
    drawn.levels?.update(local);
    for (const [key, card] of drawn.routing?.cards ?? []) {
      const found = slotOf(drawn.data.racks, key);
      if (!found) continue;
      const value = local.audioEffectMix[found.effect.id];
      if (value !== undefined) card.showLevel(value);
      card.showState(
        cardStateOf(found, local),
        local.chosenEffects.includes(found.effect.id),
      );
    }
  };

  /** An open pop-up says Switch on or off, so it follows the card. */
  const refreshPop = (local: LocalState): void => {
    const found =
      pop?.kind === "settings" ? slotOf(drawn.data.racks, pop.key) : null;
    if (!pop || !found) return;
    if (popStateOf(found.key, found.effect.id, local) === popState) return;
    const active = doc.activeElement as HTMLElement | null;
    const field = pop.element.contains(active)
      ? active?.dataset.field
      : undefined;
    const anchor = slot.querySelector<HTMLElement>(
      `[data-field="settings.${found.key}"]`,
    );
    if (!anchor) return;
    const reopened = show({ kind: "settings", key: found.key, anchor });
    if (field)
      reopened?.element
        .querySelector<HTMLElement>(`[data-field="${field}"]`)
        ?.focus();
  };

  const update = (): void => {
    const data = current();
    const shape = shapeOf(data);
    drawn.data = data;
    if (shape !== drawn.shape) {
      drawn.shape = shape;
      draw();
    }
    const local = ctx.api.state.get().local;
    showValues(local);
    refreshPop(local);
  };
  update();
  const off = ctx.api.state.subscribe((s) => s.local, update);
  const offLayers = ctx.layers?.subscribe(update);
  return {
    element: slot,
    dispose() {
      off();
      offLayers?.();
      pop?.close(false);
      gate.dispose();
    },
  };
}
