import { el, openPopover, type Popover } from "@modular-av/kit";
import {
  type Rendered,
  renderContributedControls,
} from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { renderEffects } from "./effects.ts";

/**
 * The "Voice & video settings" popover: the effects and every quick
 * control other modules contributed. It subscribes only while open.
 */
export function openQuickControls(
  ctx: DockContext,
  anchor: HTMLElement,
): Popover {
  const doc = anchor.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const parts: readonly Rendered[] = [
    renderEffects(ctx, doc, alerts),
    ...renderContributedControls(ctx, doc, "quick", alerts),
  ];
  const content = el("div", {
    doc,
    className: "mav-dock-quick-controls",
    children: [
      el("h2", { doc, text: ctx.t("panel.quick") }),
      ...parts.map((p) => p.element),
      alerts,
    ],
  });
  return openPopover({
    anchor,
    content,
    label: ctx.t("panel.quick"),
    onClose() {
      for (const part of parts) part.dispose();
    },
  });
}
