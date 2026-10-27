import {
  createMeter,
  el,
  type Meter,
  METER_MAX_DB,
  METER_MIN_DB,
  uniqueId,
} from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";

interface Parts {
  readonly element: HTMLElement;
  readonly meter: Meter;
  readonly handle: HTMLInputElement;
  readonly value: HTMLOutputElement;
}

/** The label and value over the bar; the handle on the meter, one scale. */
function parts(ctx: DockContext, doc: Document): Parts {
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

/**
 * The voice gate's threshold set on the level bar itself, as in Discord:
 * the player's level fills the bar (green while they are heard) and the
 * threshold is a handle on the same scale, its value beside it. With the
 * sensitivity automatic the handle goes and the bar shows the gate's own.
 */
export function sensitivityBar(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): Rendered {
  const { element, meter, handle, value } = parts(ctx, doc);
  const decibels = (): string =>
    ctx.t("settings.decibels", { value: handle.value });
  const show = (auto: boolean): void => {
    handle.setAttribute("aria-valuetext", decibels());
    value.textContent = auto ? ctx.t("settings.thresholdAuto") : decibels();
  };
  const render = (): void => {
    const { auto, threshold } = ctx.api.state.get().local.inputSensitivity;
    handle.hidden = auto;
    handle.value = String(threshold);
    show(auto);
  };
  // The value follows the handle while it is dragged; set when let go.
  handle.addEventListener("input", () => {
    show(false);
  });
  handle.addEventListener("change", () => {
    run(ctx, alerts, () =>
      ctx.api.commands.setInputSensitivity({ threshold: Number(handle.value) }),
    );
  });
  const offLevel = ctx.api.meters.subscribe(ctx.selfId, meter.element, (r) => {
    meter.set(r);
  });
  const offState = ctx.api.state.subscribe(
    (s) => s.local.inputSensitivity,
    render,
  );
  render();
  return {
    element,
    dispose() {
      offLevel();
      offState();
    },
  };
}
