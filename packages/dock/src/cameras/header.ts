import { el, roving } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import type { TileLayout } from "../settings.ts";
import { type IconButton, iconButton } from "../ui/button.ts";
import type { Status } from "../panel/status.ts";
import type { Where } from "./placement.ts";

export interface HeaderHandlers {
  readonly layout: () => void;
  readonly placement: (anchor: HTMLElement) => void;
  readonly collapse: () => void;
}

export interface Header {
  /** Also the floating dock's drag handle. */
  readonly element: HTMLElement;
  /** Moves the floating dock with the arrow keys. */
  readonly move: HTMLElement;
  show(state: {
    readonly where: Where;
    readonly layout: TileLayout;
    readonly collapsed: boolean;
    readonly count: number;
  }): void;
  dispose(): void;
}

function buttons(
  ctx: DockContext,
  doc: Document,
  handlers: HeaderHandlers,
): Readonly<Record<"move" | "layout" | "placement" | "collapse", IconButton>> {
  return {
    move: iconButton(doc, {
      className: "mav-dock-move",
      label: ctx.t("dock.move"),
      icon: "fa-up-down-left-right",
      onClick: () => undefined,
    }),
    layout: iconButton(doc, {
      className: "mav-dock-layout",
      label: ctx.t("dock.layoutFocus"),
      icon: "fa-table-cells-large",
      onClick: handlers.layout,
    }),
    placement: iconButton(doc, {
      className: "mav-dock-placement",
      label: ctx.t("dock.placement"),
      icon: "fa-up-right-from-square",
      onClick: (button) => {
        handlers.placement(button);
      },
    }),
    collapse: iconButton(doc, {
      className: "mav-dock-collapse",
      label: ctx.t("dock.collapse"),
      icon: "fa-chevron-up",
      onClick: handlers.collapse,
    }),
  };
}

/** The dock's title bar: the session's status, the count and the dock's tools. */
export function createHeader(
  ctx: DockContext,
  doc: Document,
  status: Status,
  handlers: HeaderHandlers,
): Header {
  const b = buttons(ctx, doc, handlers);
  b.placement.element.setAttribute("aria-haspopup", "menu");
  const count = el("span", { doc, className: "mav-dock-count" });
  const tools = el("div", {
    doc,
    className: "mav-dock-tools",
    attrs: { role: "toolbar", "aria-label": ctx.t("dock.label") },
    children: [b.move, b.layout, b.placement, b.collapse].map((x) => x.element),
  });
  const keys = roving(tools, { items: "button:not([hidden])" });
  const element = el("header", {
    doc,
    className: "mav-dock-header",
    children: [status.element, count, tools],
  });
  return {
    element,
    move: b.move.element,
    show(state) {
      // Floating, it moves the dock; scattered, the voice panel.
      b.move.element.hidden =
        state.where !== "floating" && state.where !== "scattered";
      // Scattered tiles have no grid to fit.
      b.layout.element.hidden = state.where === "scattered";
      const focus = state.layout === "focus";
      b.layout.set({
        label: ctx.t(focus ? "dock.layoutGrid" : "dock.layoutFocus"),
        icon: focus ? "fa-table-cells-large" : "fa-square",
      });
      // The arrow points where the cameras go: down at the bottom.
      const down = state.collapsed !== (state.where === "bottom");
      b.collapse.set({
        label: ctx.t(state.collapsed ? "dock.expand" : "dock.collapse"),
        icon: down ? "fa-chevron-down" : "fa-chevron-up",
      });
      b.collapse.element.setAttribute(
        "aria-expanded",
        String(!state.collapsed),
      );
      count.textContent = ctx.t("dock.count", { count: String(state.count) });
      keys.refresh();
    },
    dispose: () => {
      keys.dispose();
    },
  };
}
