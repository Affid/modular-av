import { el } from "./dom.ts";
import { clamp } from "./rect.ts";

/** The range a meter shows, in dBFS. */
export const METER_MIN_DB = -80;
export const METER_MAX_DB = 0;

/** A level's share of the meter, 0 to 1. */
export const levelFraction = (db: number): number =>
  clamp((db - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB), 0, 1);

export interface Reading {
  readonly db: number;
  /** The voice gate's threshold, if the meter shows it. */
  readonly threshold: number | null;
  /** Whether the voice gate is open, if known. */
  readonly open: boolean | null;
}

export interface Meter {
  readonly element: HTMLElement;
  /** Scaled with `transform`: drawing never changes the layout. */
  readonly fill: HTMLElement;
  /** Placed by `--mav-meter-threshold` (0 to 1) on the element. */
  readonly marker: HTMLElement;
  set(reading: Reading): void;
}

/**
 * A level meter with no timer of its own: it draws whatever readings it
 * is given (from `api.meters`, 20 a second while shown). `data-open`
 * marks the gate sending.
 */
export function createMeter(
  doc: Document,
  options: { readonly label: string },
): Meter {
  const fill = el("div", { doc, className: "mav-meter-fill" });
  const marker = el("div", { doc, className: "mav-meter-threshold" });
  marker.hidden = true;
  const element = el("div", {
    doc,
    className: "mav-meter",
    attrs: {
      role: "meter",
      "aria-label": options.label,
      "aria-valuemin": String(METER_MIN_DB),
      "aria-valuemax": String(METER_MAX_DB),
      // Until the first reading: nothing heard.
      "aria-valuenow": String(METER_MIN_DB),
    },
    children: [fill, marker],
  });
  let threshold: number | null = null;
  return {
    element,
    fill,
    marker,
    set(reading) {
      fill.style.transform = `scaleX(${String(levelFraction(reading.db))})`;
      element.setAttribute("aria-valuenow", String(Math.round(reading.db)));
      element.toggleAttribute("data-open", reading.open === true);
      if (reading.threshold === threshold) return;
      threshold = reading.threshold;
      marker.hidden = threshold === null;
      if (threshold !== null)
        element.style.setProperty(
          "--mav-meter-threshold",
          String(levelFraction(threshold)),
        );
    },
  };
}
