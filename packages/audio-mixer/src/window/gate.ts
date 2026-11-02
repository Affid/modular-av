import type { MeterReading } from "@modular-av/api";
import { el, icon } from "@modular-av/kit";
import type { MixerContext } from "./context.ts";

const FLOOR_DB = -100;

/** dBFS to a share of the meter, 0 to 100. */
const share = (db: number): number =>
  Math.round(Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB)) * 100);

export interface Gate {
  readonly element: HTMLElement;
  dispose(): void;
}

const selfId = (ctx: MixerContext): string | null =>
  Object.values(ctx.api.state.get().participants).find((p) => p.isLocal)?.id ??
  null;

/**
 * The voice gate: fixed between the places, with the one live meter the core
 * has, the microphone after the effects before it, against the threshold.
 */
export function renderGate(
  ctx: MixerContext,
  doc: Document,
  onSettings: ((anchor: HTMLElement) => void) | null,
): Gate {
  const level = el("span", { doc, className: "mav-mixer-meter-level" });
  const mark = el("span", { doc, className: "mav-mixer-meter-mark" });
  const meter = el("div", {
    doc,
    className: "mav-mixer-meter",
    attrs: {
      role: "meter",
      "aria-label": ctx.t("gateLevel"),
      "aria-valuemin": String(FLOOR_DB),
      "aria-valuemax": "0",
      "aria-valuenow": String(FLOOR_DB),
      "data-field": "gateMeter",
    },
    children: [level, mark],
  });
  const word = el("span", {
    doc,
    className: "mav-mixer-gate-state",
    text: ctx.t("gateIdle"),
  });
  const show = ({ db, threshold, open }: MeterReading): void => {
    level.style.height = `${String(share(db))}%`;
    meter.setAttribute("aria-valuenow", String(Math.round(db)));
    if (threshold !== null) mark.style.bottom = `${String(share(threshold))}%`;
    meter.toggleAttribute("data-open", open === true);
    word.textContent = ctx.t(open ? "gateOpen" : "gateClosed");
  };
  let watching: string | null = null;
  let stop = (): void => undefined;
  const watch = (): void => {
    const id = onSettings ? selfId(ctx) : null;
    if (id === watching) return;
    stop();
    watching = id;
    stop = id ? ctx.api.meters.subscribe(id, meter, show) : () => undefined;
  };
  watch();
  const offParticipants = ctx.api.state.subscribe((s) => s.participants, watch);
  const settings = onSettings
    ? el("button", {
        doc,
        className: "mav-mixer-card-settings",
        attrs: {
          type: "button",
          "data-field": "settings.gate",
          "aria-label": ctx.t("gateSettings"),
          "aria-haspopup": "dialog",
        },
        children: [icon("fa-sliders", doc)],
      })
    : null;
  settings?.addEventListener("click", () => {
    onSettings?.(settings);
  });
  return {
    element: el("section", {
      doc,
      className: "mav-mixer-gate",
      attrs: { "data-part": "gate", title: ctx.t("gateHint") },
      children: [
        el("h3", { doc, text: ctx.t("gateShort") }),
        meter,
        word,
        settings,
      ],
    }),
    dispose() {
      stop();
      offParticipants();
    },
  };
}
