import { el, icon } from "@modular-av/kit";
import { type CardState, NOISE_KEY, type Slot } from "../model/rack.ts";
import { type ChainData, heldBy, heldEntry, isPinned } from "./chain-data.ts";
import type { MixerContext } from "./context.ts";
import { percentText, PERCENT } from "./fields.ts";

/** States worth a word on the card; on and off show by the dot. */
const SAID: ReadonlySet<CardState> = new Set([
  "starting",
  "idle",
  "waiting",
  "failed",
  "unsupported",
]);

export const nameOf = (ctx: MixerContext, slot: Slot): string =>
  slot.key === NOISE_KEY
    ? ctx.t("groups.noise-suppression")
    : ctx.text(slot.effect.label);

export interface Card {
  readonly element: HTMLElement;
  /** A send's Return level, shown on the card. */
  showLevel(value: number): void;
  /** Its state changed: in place, so nothing else is redrawn. */
  showState(state: CardState, on: boolean): void;
}

/** A button to its fader; plain text on another player's chain. */
function levelTag(
  ctx: MixerContext,
  doc: Document,
  slot: Slot,
  name: string,
  readOnly: boolean,
): HTMLElement {
  const field = `level.${slot.key}`;
  return readOnly
    ? el("span", {
        doc,
        className: "mav-mixer-card-level",
        attrs: { "data-field": field },
      })
    : el("button", {
        doc,
        className: "mav-mixer-card-level",
        attrs: {
          type: "button",
          tabindex: "-1",
          "data-field": field,
          "aria-label": ctx.t("returnOf", { effect: name }),
        },
      });
}

/** One effect in the chain: its dot, name, state and settings button. */
export function renderCard(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  slot: Slot,
  state: CardState,
  readOnly: boolean,
): Card {
  const name = nameOf(ctx, slot);
  const held = heldEntry(data, slot);
  const by = heldBy(data, slot);
  const level =
    slot.place === "send" &&
    data.local.audioEffectMix[slot.effect.id] !== undefined
      ? levelTag(ctx, doc, slot, name, readOnly)
      : null;
  const dot = el("button", {
    doc,
    className: "mav-mixer-dot",
    attrs: {
      type: "button",
      tabindex: "-1",
      "data-field": `on.${slot.key}`,
      "aria-label": ctx.t("onOf", { effect: name }),
    },
  });
  const settings = readOnly
    ? null
    : el("button", {
        doc,
        className: "mav-mixer-card-settings",
        attrs: {
          type: "button",
          tabindex: "-1",
          "data-field": `settings.${slot.key}`,
          "aria-label": ctx.t("settingsOf", { effect: name }),
          "aria-haspopup": "dialog",
        },
        children: [icon("fa-sliders", doc)],
      });
  const chip = el("span", { doc, className: "mav-mixer-chip" });
  const element = el("li", {
    doc,
    className: "mav-mixer-card",
    attrs: {
      tabindex: "-1",
      "data-key": slot.key,
      "data-effect": slot.effect.id,
      ...(held ? { "data-held": "" } : {}),
      ...(readOnly || isPinned(data, slot) ? {} : { draggable: "true" }),
    },
    children: [
      dot,
      el("span", {
        doc,
        className: "mav-mixer-card-name",
        text: name,
        attrs: { title: name },
      }),
      chip,
      level,
      settings,
      slot.key === NOISE_KEY
        ? el("span", {
            doc,
            className: "mav-mixer-card-sub",
            text: ctx.text(slot.effect.label),
          })
        : null,
      by
        ? el("span", {
            doc,
            className: "mav-mixer-card-sub mav-mixer-held",
            text: ctx.t("heldBy", { layer: by }),
          })
        : null,
    ],
  });
  const showState = (next: CardState, on: boolean): void => {
    const word = ctx.t(`states.${next}`);
    element.dataset.state = next;
    element.setAttribute(
      "aria-label",
      [
        ctx.t("card", { effect: name, state: word }),
        by ? ctx.t("heldBy", { layer: by }) : "",
      ]
        .filter(Boolean)
        .join(". "),
    );
    dot.setAttribute("aria-pressed", String(on));
    dot.disabled = readOnly || held?.on !== undefined || next === "unsupported";
    chip.textContent = SAID.has(next) ? word : "";
    chip.hidden = !SAID.has(next);
  };
  const showLevel = (value: number): void => {
    if (!level) return;
    const percent = percentText(value * PERCENT);
    level.textContent = percent;
    if (readOnly) return;
    // The name holds what is shown (WCAG 2.5.3).
    level.setAttribute(
      "aria-label",
      `${ctx.t("returnOf", { effect: name })} ${percent}`,
    );
  };
  showState(state, data.local.chosenEffects.includes(slot.effect.id));
  showLevel(data.local.audioEffectMix[slot.effect.id] ?? 0);
  return { element, showState, showLevel };
}
