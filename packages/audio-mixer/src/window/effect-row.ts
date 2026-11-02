import type {
  AudioEffectDefinition,
  AudioPlace,
  EffectStatus,
  LocalState,
} from "@modular-av/api";
import { el, icon, setLabel } from "@modular-av/kit";
import {
  type Lane,
  moveChange,
  PLACES,
  placeChange,
} from "../model/pipeline.ts";
import type { Writer } from "../model/queue.ts";
import type { EffectEntry } from "../model/snapshot.ts";
import { settingsOf } from "../model/settings.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { renderSetting } from "./controls.ts";
import { levelSlider, switchField } from "./fields.ts";

export interface Row extends Rendered {
  update(local: LocalState): void;
}

export interface RowSpec {
  readonly definition: AudioEffectDefinition;
  readonly place: AudioPlace;
  readonly lanes: readonly Lane[];
  readonly writes: Writer;
  /** What a GM's layer holds of this effect: locked here. */
  readonly held: EffectEntry | undefined;
  /** A GM's layer holds the order of this place. */
  readonly orderHeld: boolean;
}

/** What to say beside a chosen effect; `running` needs nothing beyond On. */
function statusText(ctx: MixerContext, id: string, local: LocalState): string {
  const status: EffectStatus = local.effects[id]?.status ?? "off";
  if (status === "unsupported") return ctx.t("status.unsupported");
  return local.chosenEffects.includes(id) ? ctx.t(`status.${status}`) : "";
}

function moveButton(
  ctx: MixerContext,
  doc: Document,
  spec: RowSpec,
  direction: "up" | "down",
): HTMLElement {
  const { id } = spec.definition;
  const by = direction === "up" ? -1 : 1;
  const change = moveChange(spec.lanes, id, by);
  const button = el("button", {
    doc,
    className: "mav-mixer-icon",
    attrs: { type: "button", "data-field": `${direction}.${id}` },
    children: [icon(direction === "up" ? "fa-arrow-up" : "fa-arrow-down", doc)],
  });
  setLabel(
    button,
    ctx.t(direction, { effect: ctx.text(spec.definition.label) }),
    { trusted: false },
  );
  button.disabled = change === null || spec.orderHeld;
  button.addEventListener("click", () => {
    if (change)
      void spec.writes.run(`order:${spec.place}`, () =>
        ctx.api.commands.setAudioPipeline(change),
      );
  });
  return button;
}

function placeMenu(
  ctx: MixerContext,
  doc: Document,
  spec: RowSpec,
): HTMLElement {
  const { id, label } = spec.definition;
  const select = el("select", {
    doc,
    attrs: {
      "data-field": `place.${id}`,
      "aria-label": ctx.t("place", { effect: ctx.text(label) }),
    },
    children: PLACES.map((place) =>
      el("option", {
        doc,
        text: ctx.t(`places.${place}`),
        attrs: { value: place },
      }),
    ),
  });
  select.value = spec.place;
  select.disabled = spec.held?.place !== undefined;
  select.addEventListener("change", () => {
    const change = placeChange(spec.lanes, id, select.value as AudioPlace);
    if (change)
      void spec.writes.run(`place:${id}`, () =>
        ctx.api.commands.setAudioPipeline(change),
      );
  });
  return select;
}

function header(
  ctx: MixerContext,
  doc: Document,
  spec: RowSpec,
  local: LocalState,
): HTMLElement {
  const { id, label, cost } = spec.definition;
  const on = switchField(
    doc,
    ctx.text(label),
    { "data-field": `on.${id}` },
    (enabled) => {
      void spec.writes.run(`on:${id}`, () =>
        ctx.api.commands.setEffectEnabled(id, enabled),
      );
    },
  );
  const chosen = local.chosenEffects.includes(id);
  on.input.checked = chosen;
  on.input.disabled =
    spec.held?.on !== undefined ||
    (!chosen && local.effects[id]?.status === "unsupported");
  return el("div", {
    doc,
    className: "mav-mixer-row-head",
    children: [
      on.element,
      el("span", {
        doc,
        className: "mav-mixer-status",
        text: statusText(ctx, id, local),
        attrs: { "data-status": "" },
      }),
      el("span", {
        doc,
        className: "mav-mixer-cost",
        text: ctx.t(`cost.${cost}`),
      }),
      spec.held
        ? el("span", {
            doc,
            className: "mav-mixer-status",
            text: ctx.t("layers.held"),
          })
        : null,
      placeMenu(ctx, doc, spec),
      moveButton(ctx, doc, spec, "up"),
      moveButton(ctx, doc, spec, "down"),
    ],
  });
}

function lockedIfHeld(
  drawn: Rendered,
  control: string,
  held: EffectEntry | undefined,
): Rendered {
  if (held?.settings?.[control] !== undefined)
    for (const input of drawn.element.querySelectorAll<HTMLInputElement>(
      "input, select",
    ))
      input.disabled = true;
  return drawn;
}

/** One effect: its switch, where it runs, its level and its own settings. */
export function effectRow(
  ctx: MixerContext,
  doc: Document,
  spec: RowSpec,
  local: LocalState,
): Row {
  const { id, label } = spec.definition;
  const hasLevel = local.audioEffectMix[id] !== undefined;
  const level = hasLevel
    ? levelSlider(
        doc,
        ctx.t("levelOf", { effect: ctx.text(label) }),
        `mix.${id}`,
        (mix) => {
          void spec.writes.run(`mix:${id}`, () =>
            ctx.api.commands.setAudioEffectMix(id, mix),
          );
        },
      )
    : null;
  if (spec.held?.mix !== undefined) level?.lock();
  const chosen = local.chosenEffects.includes(id);
  const settings = chosen
    ? settingsOf(ctx.api.contributions.list(), id).map((c) =>
        lockedIfHeld(renderSetting(ctx, doc, c, spec.writes), c.id, spec.held),
      )
    : [];
  const update = (next: LocalState): void => {
    level?.show(next.audioEffectMix[id] ?? 1);
  };
  update(local);
  return {
    update,
    element: el("div", {
      doc,
      className: "mav-mixer-row",
      attrs: { "data-effect": id },
      children: [
        header(ctx, doc, spec, local),
        level?.element,
        ...settings.map((s) => s.element),
      ],
    }),
    dispose() {
      for (const s of settings) s.dispose();
    },
  };
}
