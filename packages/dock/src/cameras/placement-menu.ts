import { el, openPopover, type Popover, roving } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import type { Placement, Where } from "./placement.ts";

const CHOICES: readonly Where[] = [
  "left",
  "right",
  "top",
  "bottom",
  "floating",
  "window",
];

/**
 * Where the cameras go. "In a window of its own" is offered only where the
 * browser can (Chrome, Edge), and says why otherwise.
 */
export function openPlacementMenu(
  ctx: DockContext,
  anchor: HTMLElement,
  placement: Placement,
): Popover {
  const doc = anchor.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const supported = ctx.api.windows.pip.supported();
  let popover: Popover | null = null;
  const items = CHOICES.map((where) => {
    const item = el("button", {
      doc,
      className: "mav-dock-menu-item",
      text: ctx.t(`dock.${where}`),
      attrs: {
        type: "button",
        role: "menuitemradio",
        "aria-checked": String(placement.where === where),
        "data-placement": where,
      },
    });
    if (where === "window" && !supported) {
      item.disabled = true;
      item.title = ctx.t("dock.windowUnsupported");
    }
    item.addEventListener("click", () => {
      popover?.close();
      run(ctx, alerts, () =>
        where === "window" ? placement.openWindow() : placement.set(where),
      );
    });
    return item;
  });
  const menu = el("div", {
    doc,
    className: "mav-dock-menu",
    attrs: { role: "menu", "aria-label": ctx.t("dock.placement") },
    children: [
      ...items,
      ...(supported
        ? []
        : [el("p", { doc, text: ctx.t("dock.windowUnsupported") })]),
      alerts,
    ],
  });
  const keys = roving(menu, {
    items: "button:not(:disabled)",
    orientation: "vertical",
  });
  popover = openPopover({
    anchor,
    content: menu,
    label: ctx.t("dock.placement"),
    onClose: () => {
      keys.dispose();
    },
  });
  items.find((i) => i.getAttribute("aria-checked") === "true")?.focus();
  return popover;
}
