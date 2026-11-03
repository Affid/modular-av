import { el } from "@modular-av/kit";
import { cardStateOf, type Slot } from "../model/rack.ts";
import {
  type SettingControl,
  settingsOf,
  type SettingValue,
} from "../model/settings.ts";
import type { EffectEntry } from "../model/snapshot.ts";
import { type ChainData, heldBy } from "./chain-data.ts";
import type { MixerContext } from "./context.ts";
import { rangeText } from "./controls.ts";
import type { PopContent } from "./popover.ts";

/** A value as the player's own control would show it. */
function valueText(
  ctx: MixerContext,
  control: SettingControl,
  value: SettingValue,
): string {
  if (control.type === "toggle")
    return ctx.t(value === true ? "states.on" : "states.off");
  if (control.type === "choice") {
    const option = control.options.find((o) => o.value === value);
    return option ? ctx.text(option.label) : String(value);
  }
  return typeof value === "number"
    ? rangeText(ctx, control, value)
    : String(value);
}

const row = (
  doc: Document,
  term: string,
  value: string,
): readonly HTMLElement[] => [
  el("dt", { doc, text: term }),
  el("dd", { doc, text: value }),
];

/** Each setting the report gives that this client has a control for. */
function settingRows(
  ctx: MixerContext,
  doc: Document,
  slot: Slot,
  entry: EffectEntry | undefined,
): readonly HTMLElement[] {
  const given = entry?.settings ?? {};
  return settingsOf(ctx.api.contributions.list(), slot.effect.id).flatMap(
    (control) => {
      const value = given[control.id];
      return value === undefined
        ? []
        : row(doc, ctx.text(control.label), valueText(ctx, control, value));
    },
  );
}

/** Another player's effect as their report has it: text, nothing to change. */
export function reportSettings(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  slot: Slot,
  entry: EffectEntry | undefined,
  player: string,
): PopContent {
  const by = heldBy(data, slot);
  return {
    element: el("div", {
      doc,
      className: "mav-mixer-pop-body",
      children: [
        by
          ? el("p", {
              doc,
              className: "mav-mixer-held",
              text: ctx.t("heldBy", { layer: by }),
            })
          : null,
        el("dl", {
          doc,
          className: "mav-mixer-readout",
          children: [
            ...row(
              doc,
              ctx.t("table.state"),
              ctx.t(`states.${cardStateOf(slot, data.local)}`),
            ),
            ...(slot.members.length > 1
              ? row(doc, ctx.t("model"), ctx.text(slot.effect.label))
              : []),
            ...row(doc, ctx.t("table.place"), ctx.t(`places.${slot.place}`)),
            ...settingRows(ctx, doc, slot, entry),
          ],
        }),
        el("p", {
          doc,
          className: "mav-mixer-hint",
          text: ctx.t("table.readOnly", { player }),
        }),
      ],
    }),
    dispose: () => undefined,
  };
}
