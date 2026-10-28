import {
  createMeter,
  el,
  type Meter,
  METER_MAX_DB,
  METER_MIN_DB,
  uniqueId,
} from "@modular-av/kit";
import type { Preview } from "@modular-av/api";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import type { Draft } from "./draft.ts";

export interface SensitivityParts {
  readonly element: HTMLElement;
  readonly meter: Meter;
  readonly handle: HTMLInputElement;
  readonly value: HTMLOutputElement;
}

/** The label and value over the bar; the handle on the meter, one scale. */
export function sensitivityParts(
  ctx: DockContext,
  doc: Document,
): SensitivityParts {
  const id = uniqueId(doc, "mav-threshold");
  const meter = createMeter(doc, { label: ctx.t("menu.level") });
  const handle = el("input", {
    doc,
    className: "mav-sensitivity-handle",
    attrs: {
      type: "range",
      id,
      min: String(METER_MIN_DB),
      max: String(METER_MAX_DB),
      step: "1",
    },
  });
  const value = el("output", {
    doc,
    className: "mav-sensitivity-value",
    attrs: { for: id },
  });
  const label = el("label", {
    doc,
    text: ctx.t("settings.threshold"),
    attrs: { for: id },
  });
  const element = el("div", {
    doc,
    className: "mav-sensitivity",
    children: [
      el("div", {
        doc,
        className: "mav-sensitivity-head",
        children: [label, value],
      }),
      el("div", {
        doc,
        className: "mav-sensitivity-bar",
        children: [meter.element, handle],
      }),
    ],
  });
  return { element, meter, handle, value };
}

/** Why the microphone can't be heard here, in words. */
const reasonKey = (error: unknown): string =>
  error instanceof Error && error.name === "NotAllowedError"
    ? "settings.micBlocked"
    : "settings.micFailed";

/**
 * The voice gate's threshold set on the level bar itself, as in Discord:
 * the chosen microphone's level fills the bar, outside the call too (a
 * preview of its own), green above the threshold; the threshold is a
 * handle on the same scale, its value beside it. Drafted until Save; with
 * the sensitivity automatic the handle goes.
 */
export function sensitivityBar(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
): Rendered {
  const { element, meter, handle, value } = sensitivityParts(ctx, doc);
  const note = el("p", {
    doc,
    className: "mav-settings-hint",
    attrs: { hidden: "" },
  });
  element.append(note);
  const decibels = (): string =>
    ctx.t("settings.decibels", { value: handle.value });
  const render = (): void => {
    const auto = draft.get("sensitivityAuto");
    handle.hidden = auto;
    handle.value = String(draft.get("threshold"));
    handle.setAttribute("aria-valuetext", decibels());
    value.textContent = auto ? ctx.t("settings.thresholdAuto") : decibels();
  };
  handle.addEventListener("input", () => {
    draft.set("threshold", Number(handle.value));
  });
  const level = (db: number): void => {
    const auto = draft.get("sensitivityAuto");
    const threshold = draft.get("threshold");
    meter.set({
      db,
      threshold: auto ? null : threshold,
      open: auto ? null : db >= threshold,
    });
  };
  const mic = microphonePreview(ctx, meter.element, draft, level, (error) => {
    note.hidden = error === null;
    note.textContent = error === null ? "" : ctx.t(reasonKey(error));
  });
  render();
  const off = draft.subscribe(() => {
    render();
    mic.follow();
  });
  return {
    element,
    dispose() {
      off();
      mic.stop();
    },
  };
}

/**
 * The draft's microphone, heard for the bar alone while voice activity is
 * chosen (the bar shows only then), restarted when it changes. Only the
 * latest request is kept. `report` gets each failure, and null as a new
 * request starts.
 */
function microphonePreview(
  ctx: DockContext,
  element: Element,
  draft: Draft,
  listener: (db: number) => void,
  report: (error: unknown) => void,
): { follow(): void; stop(): void } {
  let running: Preview | null = null;
  let device: string | null | undefined;
  let request = 0;
  let stopped = false;
  const follow = (): void => {
    const next =
      draft.get("voiceMode") === "activity" ? draft.get("audioInput") : null;
    if (next === device) return;
    device = next;
    request += 1;
    const mine = request;
    running?.stop();
    running = null;
    report(null);
    if (next === null) return;
    ctx.api.preview
      .microphone(element, { device: next, listener })
      .then((preview) => {
        if (stopped || request !== mine) preview.stop();
        else running = preview;
      })
      .catch((error: unknown) => {
        if (!stopped && request === mine) report(error);
      });
  };
  follow();
  return {
    follow,
    stop() {
      stopped = true;
      running?.stop();
    },
  };
}
