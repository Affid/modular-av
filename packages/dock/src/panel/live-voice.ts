import type { VoiceMode } from "@modular-av/api";
import { el, type Meter, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { selectField } from "../settings-window/fields.ts";
import { sensitivityParts } from "../settings-window/sensitivity.ts";
import { run } from "../ui/run.ts";

const MODES: readonly VoiceMode[] = ["always", "activity", "ptt"];

/**
 * The input mode, a select as in the settings window (the same control
 * for the same setting); a choice switches the call's mode at once.
 */
export function voiceModeChoice(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): Rendered {
  const field = selectField(
    ctx,
    doc,
    {
      read: () => ({
        options: MODES.map((m) => ({
          value: m,
          label: ctx.t(`settings.mode-${m}`),
        })),
        value: ctx.api.state.get().local.voiceMode,
      }),
      write: (value) =>
        ctx.api.commands.setVoiceMode(
          MODES.find((m) => m === value) ?? "always",
        ),
      subscribe: (render) =>
        ctx.api.state.subscribe((s) => s.local.voiceMode, render),
    },
    alerts,
  );
  const id = uniqueId(doc, "mav-control");
  field.element.id = id;
  return {
    element: el("div", {
      doc,
      className: "mav-control",
      children: [
        el("label", {
          doc,
          className: "mav-control-label",
          text: ctx.t("settings.voiceMode"),
          attrs: { for: id },
        }),
        field.element,
      ],
    }),
    dispose() {
      field.dispose();
    },
  };
}

const localId = (ctx: DockContext): string | undefined =>
  Object.values(ctx.api.state.get().participants).find((p) => p.isLocal)?.id;

/**
 * The local player's level on `meter`, from the call's own meter: once
 * they are in the state (the menu may open before they joined).
 */
function localMeter(ctx: DockContext, meter: Meter): () => void {
  let unmeter: (() => void) | null = null;
  const follow = (): void => {
    const id = unmeter ? undefined : localId(ctx);
    if (id)
      unmeter = ctx.api.meters.subscribe(id, meter.element, (reading) => {
        meter.set(reading);
      });
  };
  follow();
  const off = ctx.api.state.subscribe((s) => s.participants, follow);
  return () => {
    off();
    unmeter?.();
  };
}

/** Automatic or not: a switch that sets the call's sensitivity at once. */
function autoSwitch(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): HTMLButtonElement {
  const button = el("button", {
    doc,
    className: "mav-control-switch",
    text: ctx.t("settings.automatic"),
    attrs: { type: "button", role: "switch", "aria-checked": "false" },
  });
  button.addEventListener("click", () => {
    const auto = ctx.api.state.get().local.inputSensitivity.auto;
    run(ctx, alerts, () =>
      ctx.api.commands.setInputSensitivity({ auto: !auto }),
    );
  });
  return button;
}

/**
 * The voice gate's threshold on the call's own level bar, applied at once
 * (the settings window drafts it until Save). The bar is the call's meter
 * of the local player, so it costs nothing new.
 */
export function liveSensitivity(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): Rendered {
  const { element, meter, handle, value } = sensitivityParts(ctx, doc);
  const auto = autoSwitch(ctx, doc, alerts);
  const render = (): void => {
    const sensitivity = ctx.api.state.get().local.inputSensitivity;
    auto.setAttribute("aria-checked", String(sensitivity.auto));
    handle.hidden = sensitivity.auto;
    handle.value = String(sensitivity.threshold);
    const db = ctx.t("settings.decibels", { value: handle.value });
    handle.setAttribute("aria-valuetext", db);
    value.textContent = sensitivity.auto ? ctx.t("settings.thresholdAuto") : db;
  };
  handle.addEventListener("input", () => {
    value.textContent = ctx.t("settings.decibels", { value: handle.value });
  });
  handle.addEventListener("change", () => {
    const threshold = Number(handle.value);
    run(ctx, alerts, () => ctx.api.commands.setInputSensitivity({ threshold }));
  });
  const unmeter = localMeter(ctx, meter);
  render();
  const off = ctx.api.state.subscribe((s) => s.local.inputSensitivity, render);
  const title = el("span", {
    doc,
    className: "mav-control-label",
    text: ctx.t("settings.sensitivity"),
    attrs: { id: uniqueId(doc, "mav-sensitivity") },
  });
  return {
    element: el("div", {
      doc,
      className: "mav-settings-group",
      attrs: { role: "group", "aria-labelledby": title.id },
      children: [title, auto, element],
    }),
    dispose() {
      off();
      unmeter();
    },
  };
}
