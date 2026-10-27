import { el, openPopover, type Popover, roving } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import type { SceneControls } from "../scattered/scattered.ts";
import { run } from "../ui/run.ts";
import type { Placement, Where } from "./placement.ts";

const CHOICES: readonly Where[] = [
  "left",
  "right",
  "top",
  "bottom",
  "floating",
  "scattered",
  "window",
];

interface SceneItem {
  readonly action: string;
  readonly label: string;
  readonly run: () => Promise<void>;
}

/** What a scattered layout offers on the scene shown: GMs save it for everyone. */
function sceneItems(ctx: DockContext, scene: SceneControls): SceneItem[] {
  const gm = ctx.isGM && scene.shown;
  return [
    ...(gm
      ? [
          {
            action: "save-scene-layout",
            label: "dock.saveSceneLayout",
            run: () => scene.save(),
          },
        ]
      : []),
    ...(gm && scene.hasLayout
      ? [
          {
            action: "clear-scene-layout",
            label: "dock.clearSceneLayout",
            run: () => scene.clear(),
          },
        ]
      : []),
    ...(scene.source === "own-scene"
      ? [
          {
            action: "back-to-scene",
            label: "dock.backToScene",
            run: () => {
              scene.back();
              return Promise.resolve();
            },
          },
        ]
      : []),
  ];
}

/**
 * Where the cameras go. "In a window of its own" is offered only where the
 * browser can (Chrome, Edge), and says why otherwise.
 */
export function openPlacementMenu(
  ctx: DockContext,
  anchor: HTMLElement,
  placement: Placement,
  scene: SceneControls | null = null,
): Popover {
  const doc = anchor.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const supported = ctx.api.windows.pip.supported();
  const suggested = ctx.themes.shown()?.suggestedLayout;
  /** The theme's suggested layout is offered, never applied by itself. */
  const isSuggested = (where: Where): boolean =>
    where === suggested ||
    (suggested === "docked" &&
      ["left", "right", "top", "bottom"].includes(where));
  let popover: Popover | null = null;
  const items = CHOICES.map((where) => {
    const item = el("button", {
      doc,
      className: "mav-dock-menu-item",
      text: isSuggested(where)
        ? ctx.t("dock.suggested", { layout: ctx.t(`dock.${where}`) })
        : ctx.t(`dock.${where}`),
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
  const extra = (scene ? sceneItems(ctx, scene) : []).map((entry) => {
    const item = el("button", {
      doc,
      className: "mav-dock-menu-item",
      text: ctx.t(entry.label),
      attrs: { type: "button", role: "menuitem", "data-action": entry.action },
    });
    item.addEventListener("click", () => {
      popover?.close();
      run(ctx, alerts, entry.run);
    });
    return item;
  });
  const menu = el("div", {
    doc,
    className: "mav-dock-menu",
    attrs: { role: "menu", "aria-label": ctx.t("dock.placement") },
    children: [
      ...items,
      ...(extra.length > 0
        ? [el("hr", { doc, attrs: { role: "separator" } }), ...extra]
        : []),
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
