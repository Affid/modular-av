import type { AudioPlace } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { PLACES, type Slot } from "../model/rack.ts";
import { settingsOf } from "../model/settings.ts";
import type { Writer } from "../model/queue.ts";
import { type ChainData, heldEntry, isPinned } from "./chain-data.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { renderSetting } from "./controls.ts";
import { slider, switchField } from "./fields.ts";
import type { PopContent } from "./popover.ts";

/** What the pop-up asks the chain to do. */
export interface SettingsHandlers {
  place(key: string, place: AudioPlace): void;
  toggle(key: string): void;
  remove(key: string): void;
  model(id: string): void;
}

function button(
  doc: Document,
  text: string,
  field: string,
  onClick: () => void,
): HTMLButtonElement {
  const found = el("button", {
    doc,
    text,
    attrs: { type: "button", "data-field": field },
  });
  found.addEventListener("click", onClick);
  return found;
}

function modelPicker(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  slot: Slot,
  handlers: SettingsHandlers,
): HTMLElement {
  const select = el("select", {
    doc,
    attrs: { "data-field": "model", "aria-label": ctx.t("model") },
    children: slot.members.map((d) => {
      const status = data.local.effects[d.id]?.status;
      const option = el("option", {
        doc,
        text: ctx.text(d.label),
        attrs: { value: d.id },
      });
      option.disabled = status === "unsupported" || status === "unavailable";
      return option;
    }),
  });
  select.value = slot.effect.id;
  select.disabled = heldEntry(data, slot) !== undefined;
  select.addEventListener("change", () => {
    handlers.model(select.value);
  });
  return el("div", {
    doc,
    className: "mav-mixer-choice",
    children: [el("span", { doc, text: ctx.t("model") }), select],
  });
}

function placePicker(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  slot: Slot,
  handlers: SettingsHandlers,
): HTMLSelectElement {
  const select = el("select", {
    doc,
    attrs: {
      "data-field": `place.${slot.effect.id}`,
      "aria-label": ctx.t("place", { effect: ctx.text(slot.effect.label) }),
    },
    children: PLACES.map((place) =>
      el("option", {
        doc,
        text: ctx.t(`places.${place}`),
        attrs: { value: place },
      }),
    ),
  });
  select.value = slot.place;
  select.disabled = isPinned(data, slot);
  select.addEventListener("change", () => {
    handlers.place(slot.key, select.value as AudioPlace);
  });
  return select;
}

/** Its own controls, while it runs; locked where a GM's layer holds them. */
function ownSettings(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  slot: Slot,
  writes: Writer,
): readonly Rendered[] {
  const held = heldEntry(data, slot);
  return settingsOf(ctx.api.contributions.list(), slot.effect.id).map(
    (control) => {
      const drawn = renderSetting(ctx, doc, control, writes);
      if (held?.settings?.[control.id] !== undefined)
        for (const input of drawn.element.querySelectorAll<HTMLInputElement>(
          "input, select",
        ))
          input.disabled = true;
      return drawn;
    },
  );
}

function layerPart(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  onRefuse: (id: string) => void,
): readonly HTMLElement[] {
  return data.layers.flatMap((layer) => [
    el("p", {
      doc,
      className: "mav-mixer-held",
      text: ctx.t("heldBy", { layer: layer.label }),
    }),
    button(
      doc,
      ctx.t("refuseLayer", { layer: layer.label }),
      `refuse.${layer.id}`,
      () => {
        onRefuse(layer.id);
      },
    ),
  ]);
}

/** An effect's settings: its own controls, the model, place, switch and remove. */
export function effectSettings(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  slot: Slot,
  writes: Writer,
  handlers: SettingsHandlers,
): PopContent {
  const on = data.local.chosenEffects.includes(slot.effect.id);
  const held = heldEntry(data, slot);
  const settings = on ? ownSettings(ctx, doc, data, slot, writes) : [];
  const layers = ctx.layers;
  const power = button(
    doc,
    ctx.t(on ? "switchOff" : "switchOn"),
    `power.${slot.key}`,
    () => {
      handlers.toggle(slot.key);
    },
  );
  power.disabled = held?.on !== undefined;
  const remove = button(doc, ctx.t("remove"), `remove.${slot.key}`, () => {
    handlers.remove(slot.key);
  });
  remove.disabled = held !== undefined;
  const cost = ctx.t(`cost.${slot.effect.cost}`);
  return {
    element: el("div", {
      doc,
      className: "mav-mixer-pop-body",
      children: [
        ...(held && layers
          ? layerPart(ctx, doc, data, (id) => {
              layers.refuse(id).catch((error: unknown) => {
                ctx.onError(error);
              });
            })
          : []),
        slot.members.length > 1
          ? modelPicker(ctx, doc, data, slot, handlers)
          : null,
        ...settings.map((s) => s.element),
        on || settings.length
          ? null
          : el("p", {
              doc,
              className: "mav-mixer-hint",
              text: ctx.t("offHint"),
            }),
        el("p", { doc, className: "mav-mixer-hint", text: cost }),
        el("div", {
          doc,
          className: "mav-mixer-pop-foot",
          children: [
            placePicker(ctx, doc, data, slot, handlers),
            power,
            remove,
          ],
        }),
      ],
    }),
    dispose() {
      for (const s of settings) s.dispose();
    },
  };
}

const THRESHOLD_MIN = -100;

/** The voice gate's sensitivity, as the voice settings set it. */
export function gateSettings(
  ctx: MixerContext,
  doc: Document,
  writes: Writer,
): PopContent {
  const { inputSensitivity } = ctx.api.state.get().local;
  const threshold = slider(doc, {
    label: ctx.t("gateThreshold"),
    min: THRESHOLD_MIN,
    max: 0,
    step: 1,
    attrs: { "data-field": "gateThreshold" },
    format: (value) => ctx.t("decibels", { value: String(value) }),
    write: (value) => {
      void writes.run("gate:threshold", () =>
        ctx.api.commands.setInputSensitivity({ threshold: value }),
      );
    },
  });
  const auto = switchField(
    doc,
    ctx.t("gateAuto"),
    { "data-field": "gateAuto" },
    (on) => {
      void writes.run("gate:auto", () =>
        ctx.api.commands.setInputSensitivity({ auto: on }),
      );
      threshold.lock(on);
    },
  );
  auto.input.checked = inputSensitivity.auto;
  threshold.show(inputSensitivity.threshold);
  threshold.lock(inputSensitivity.auto);
  return {
    element: el("div", {
      doc,
      className: "mav-mixer-pop-body",
      children: [
        el("p", { doc, className: "mav-mixer-hint", text: ctx.t("gateHint") }),
        auto.element,
        threshold.element,
      ],
    }),
    dispose: () => undefined,
  };
}
