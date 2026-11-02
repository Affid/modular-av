import type { LocalState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { cardStateOf, slotOf } from "../model/rack.ts";
import type { Writer } from "../model/queue.ts";
import { createActions, currentChain } from "./chain-actions.ts";
import { type ChainData, shapeOf } from "./chain-data.ts";
import { createPops } from "./chain-pops.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { byField } from "./fields.ts";
import { renderGate } from "./gate.ts";
import { type Levels, renderLevels } from "./levels.ts";
import { renderRouting, type Routing } from "./routing.ts";
import { keepScrolls } from "./scrolls.ts";

interface Drawn {
  data: ChainData;
  shape: string;
  routing: Routing | null;
  levels: Levels | null;
}

/** Marks the selected card and its fader alike. */
function markSelected(root: HTMLElement, selected: string | null): void {
  for (const card of root.querySelectorAll<HTMLElement>("[data-key]"))
    if (card.dataset.key === selected)
      card.setAttribute("aria-current", "true");
    else card.removeAttribute("aria-current");
  for (const fader of root.querySelectorAll<HTMLElement>("[data-fader]"))
    fader.toggleAttribute("data-selected", fader.dataset.fader === selected);
}

/** States and levels change in place, so nothing is redrawn under a drag. */
function showValues(drawn: Drawn, local: LocalState): void {
  drawn.levels?.update(local);
  for (const [key, card] of drawn.routing?.cards ?? []) {
    const slot = slotOf(drawn.data.racks, key);
    if (!slot) continue;
    const value = local.audioEffectMix[slot.effect.id];
    if (value !== undefined) card.showLevel(value);
    card.showState(
      cardStateOf(slot, local),
      local.chosenEffects.includes(slot.effect.id),
    );
  }
}

/** The player's own chain: routing above, levels below, both live. */
export function renderChain(
  ctx: MixerContext,
  doc: Document,
  writes: Writer,
): Rendered {
  const root = el("div", { doc, className: "mav-mixer-chain" });
  const drawn: Drawn = {
    data: currentChain(ctx),
    shape: "",
    routing: null,
    levels: null,
  };
  let selected: string | null = null;
  let pending: string | null = null;
  const select = (key: string): void => {
    selected = key;
    markSelected(root, selected);
  };
  const actions = createActions({
    ctx,
    writes,
    root,
    select,
    focusAfter: (key) => {
      pending = key;
    },
    settings: (key, anchor) => {
      select(key);
      pops.show({ kind: "settings", key, anchor });
    },
    add: (place, anchor) => {
      pops.show({ kind: "browser", key: place, anchor });
    },
    closePop: () => {
      pops.close();
    },
  });
  const pops = createPops({
    ...{ ctx, doc, root, writes },
    data: () => drawn.data,
    settings: () => actions.settings,
    pick: (offer, place) => {
      actions.pick(offer, place);
    },
  });
  const gate = renderGate(ctx, doc, (anchor) => {
    pops.show({ kind: "gate", key: "gate", anchor });
  });

  const draw = (): void => {
    const active = doc.activeElement as HTMLElement | null;
    const inside = active !== null && root.contains(active);
    // A move's card takes the keyboard back, unless it went to a control.
    const onCard = inside ? active.dataset.key : undefined;
    const free = !active || active === doc.body || onCard !== undefined;
    const focusedKey = (free ? pending : null) ?? onCard;
    pending = null;
    const kept = pops.keep();
    const field = inside && !kept ? active.dataset.field : undefined;
    pops.close();
    const routing = renderRouting(
      ctx,
      doc,
      drawn.data,
      gate.element,
      actions.routing,
    );
    const levels = renderLevels(ctx, doc, drawn.data, actions.levels);
    const scrollBack = keepScrolls(root);
    root.replaceChildren(routing.element, levels.element);
    scrollBack();
    drawn.routing = routing;
    drawn.levels = levels;
    markSelected(root, selected);
    if (focusedKey) routing.focus(focusedKey);
    else byField(root, field)?.focus();
    if (kept) pops.restore(kept);
  };

  const update = (): void => {
    drawn.data = currentChain(ctx);
    const shape = shapeOf(drawn.data);
    if (shape !== drawn.shape) {
      drawn.shape = shape;
      draw();
    }
    const { local } = ctx.api.state.get();
    showValues(drawn, local);
    pops.follow(local);
  };
  update();
  const off = ctx.api.state.subscribe((s) => s.local, update);
  const offLayers = ctx.layers?.subscribe(update);
  return {
    element: root,
    dispose() {
      off();
      offLayers?.();
      pops.close();
      gate.dispose();
    },
  };
}
