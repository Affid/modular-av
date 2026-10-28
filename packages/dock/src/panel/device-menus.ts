import { el, openPopover, type Popover } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { deviceGroup } from "./device-picker.ts";
import { renderEffects } from "./effects.ts";
import { liveSensitivity, voiceModeChoice } from "./live-voice.ts";

/** The sensitivity, there only while voice activity is the input mode. */
function sensitivityWhileActivity(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): Rendered {
  const slot = el("div", { doc, className: "mav-dock-menu-sensitivity" });
  let shown: Rendered | null = null;
  const render = (): void => {
    const activity = ctx.api.state.get().local.voiceMode === "activity";
    if (activity && !shown) {
      shown = liveSensitivity(ctx, doc, alerts);
      slot.append(shown.element);
    } else if (!activity && shown) {
      shown.dispose();
      shown.element.remove();
      shown = null;
    }
  };
  render();
  const off = ctx.api.state.subscribe((s) => s.local.voiceMode, render);
  return {
    element: slot,
    dispose() {
      off();
      shown?.dispose();
    },
  };
}

/** A device menu's popover: its title, its parts, and their alerts. */
function openMenu(
  anchor: HTMLElement,
  title: string,
  build: (doc: Document, alerts: HTMLElement) => readonly Rendered[],
): Popover {
  const doc = anchor.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const parts = build(doc, alerts);
  const content = el("div", {
    doc,
    className: "mav-dock-quick-controls",
    children: [
      el("h2", { doc, text: title }),
      ...parts.map((p) => p.element),
      alerts,
    ],
  });
  return openPopover({
    anchor,
    content,
    label: title,
    onClose() {
      for (const part of parts) part.dispose();
    },
  });
}

/** The microphone's menu: microphone and speakers, input mode, noise cancellation. */
export function openMicMenu(ctx: DockContext, anchor: HTMLElement): Popover {
  return openMenu(anchor, ctx.t("panel.micMenu"), (doc, alerts) => [
    deviceGroup(ctx, doc, ["audioInput", "audioOutput"], alerts),
    voiceModeChoice(ctx, doc, alerts),
    sensitivityWhileActivity(ctx, doc, alerts),
    renderEffects(ctx, doc, alerts, { kind: "audio" }),
  ]);
}

/** The camera's menu: the camera and its background. */
export function openCameraMenu(ctx: DockContext, anchor: HTMLElement): Popover {
  return openMenu(anchor, ctx.t("panel.cameraMenu"), (doc, alerts) => [
    deviceGroup(ctx, doc, ["videoInput"], alerts),
    renderEffects(ctx, doc, alerts, { kind: "video" }),
  ]);
}
