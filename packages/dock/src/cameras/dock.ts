import type { CamerasHost, CamerasSurfaceDefinition } from "@modular-av/api";
import { el, icon, type Insets, NO_INSETS, setLabel } from "@modular-av/kit";
import { type DockContext, MODULE_ID } from "../context.ts";
import { openParticipantMenu } from "../menus/participant-menu.ts";
import { openQuickControls } from "../panel/quick-controls.ts";
import { createStatus, type Status } from "../panel/status.ts";
import { createVoicePanel, type VoicePanel } from "../panel/voice-panel.ts";
import {
  isCollapsed,
  save,
  SETTINGS,
  tileLayout,
  type TileLayout,
} from "../settings.ts";
import type { Scattered } from "../scattered/scattered.ts";
import { createHeader, type Header } from "./header.ts";
import { createPlacement, type Placement, type Where } from "./placement.ts";
import { openPlacementMenu } from "./placement-menu.ts";
import { createTileList, type TileList } from "./tiles.ts";

interface Dock {
  readonly root: HTMLElement;
  readonly header: Header;
  readonly tiles: TileList;
  readonly status: Status;
  readonly panel: VoicePanel;
  layout: TileLayout;
  collapsed: boolean;
  placement: Placement | null;
  scattered: Scattered | null;
}

/** The header shows where the dock is, its layout and how many are in. */
function show(dock: Dock): void {
  dock.root.dataset.tileLayout = dock.layout;
  dock.root.toggleAttribute("data-collapsed", dock.collapsed);
  dock.tiles.setLayout(dock.layout);
  dock.header.show({
    where: dock.placement?.where ?? "left",
    layout: dock.layout,
    collapsed: dock.collapsed,
    count: dock.tiles.count,
  });
}

function resizeHandle(ctx: DockContext, doc: Document): HTMLButtonElement {
  const button = el("button", {
    doc,
    className: "mav-dock-resize",
    attrs: { type: "button" },
    children: [icon("fa-up-right-and-down-left-from-center", doc)],
  });
  setLabel(button, ctx.t("dock.resize"));
  return button;
}

function build(ctx: DockContext, host: CamerasHost): Dock {
  const doc = host.element.ownerDocument;
  const status = createStatus(ctx, doc);
  const tiles = createTileList(ctx, doc, {
    menu: (id, anchor) => {
      openParticipantMenu(ctx, id, anchor);
    },
  });
  const panel = createVoicePanel(ctx, doc, status, {
    quick: (anchor) => {
      openQuickControls(ctx, anchor);
    },
  });
  const dock: Dock = {
    root: el("section", {
      doc,
      className: "mav-dock",
      attrs: { "aria-label": ctx.t("dock.label") },
    }),
    header: createHeader(ctx, doc, status, {
      layout: () => {
        dock.layout = dock.layout === "grid" ? "focus" : "grid";
        save(ctx, SETTINGS.tileLayout, dock.layout);
        show(dock);
      },
      placement: (anchor) => {
        if (dock.placement)
          openPlacementMenu(
            ctx,
            anchor,
            dock.placement,
            dock.scattered?.scene ?? null,
          );
      },
      collapse: () => {
        dock.collapsed = !dock.collapsed;
        save(ctx, SETTINGS.collapsed, dock.collapsed);
        show(dock);
      },
    }),
    tiles,
    status,
    panel,
    layout: tileLayout(ctx),
    collapsed: isCollapsed(ctx),
    placement: null,
    scattered: null,
  };
  dock.root.append(dock.header.element, tiles.element, panel.element);
  return dock;
}

/** A theme's frame reach, as fractions of the tile's width. */
const reachOf = (ctx: DockContext): Insets =>
  ctx.themes.shown()?.frames?.reach ?? NO_INSETS;

/**
 * The frame layer reaches past each tile as the theme declares; the grid
 * leaves room for it, and so does the scattered layout.
 */
function showFrames(ctx: DockContext, dock: Dock): void {
  const reach = reachOf(ctx);
  const style = dock.root.style;
  const css = (value: number): string => String(Number(value.toFixed(4)));
  for (const side of ["top", "right", "bottom", "left"] as const)
    style.setProperty(`--mav-dock-frame-${side}`, css(reach[side]));
  style.setProperty(
    "--mav-dock-frame-across",
    css(1 + reach.left + reach.right),
  );
  dock.tiles.setFrameReach(reach);
  dock.scattered?.relayout();
}

/** The scattered layout's code, loaded only when a player picks it. */
const loadScattered = () => import("../scattered/scattered.ts");

/** Read again after an await: another call may have scattered the dock. */
const isScattered = (dock: Dock): boolean => dock.scattered !== null;

function leaveScattered(dock: Dock): void {
  dock.scattered?.dispose();
  dock.scattered = null;
  dock.root.prepend(dock.header.element);
  dock.tiles.setScattered(false);
}

/**
 * Scattered, the header (status, count, tools) joins the voice panel,
 * which is placed like a tile; the tiles are placed one by one.
 */
async function scatter(
  ctx: DockContext,
  dock: Dock,
  where: Where,
): Promise<void> {
  if (where !== "scattered") {
    if (dock.scattered) leaveScattered(dock);
    return;
  }
  if (dock.scattered) return;
  const { createScattered } = await loadScattered();
  // Moved elsewhere, or scattered already, while the code loaded.
  if (dock.placement?.where !== "scattered" || isScattered(dock)) return;
  dock.panel.element.prepend(dock.header.element);
  dock.tiles.setScattered(true);
  dock.scattered = createScattered(
    ctx,
    {
      root: dock.root,
      tiles: dock.tiles.element,
      panel: dock.panel.element,
      panelHandle: dock.header.element,
      panelMove: dock.header.move,
    },
    { reach: () => reachOf(ctx) },
  );
  show(dock);
}

/**
 * The cameras surface: a dock in the core's camera dock host, docked on
 * a side, floating or in its own window, with the voice panel. Mounted
 * once per page; every state it shows comes from the core.
 */
export function camerasSurface(ctx: DockContext): CamerasSurfaceDefinition {
  return {
    kind: "cameras",
    id: `${MODULE_ID}.cameras`,
    label: `${MODULE_ID}.surfaces.cameras`,
    mount(host) {
      const dock = build(ctx, host);
      const resize = resizeHandle(ctx, dock.root.ownerDocument);
      dock.root.append(resize);
      host.element.append(dock.root);
      const placement = createPlacement(ctx, host, {
        root: dock.root,
        handle: dock.header.element,
        move: dock.header.move,
        resize,
      });
      dock.placement = placement;
      placement.onChange((where) => {
        scatter(ctx, dock, where).catch(ctx.onError);
        // In or out of the Picture-in-Picture window: timers and observers follow.
        dock.tiles.rehome();
        dock.status.rehome();
        dock.tiles.setHorizontal(where === "top" || where === "bottom");
        show(dock);
      });
      dock.tiles.onChange(() => {
        dock.scattered?.refresh();
        show(dock);
      });
      showFrames(ctx, dock);
      const offThemes = ctx.themes.onChange(() => {
        showFrames(ctx, dock);
      });
      show(dock);
      return {
        unmount() {
          offThemes();
          dock.scattered?.dispose();
          placement.dispose();
          dock.tiles.dispose();
          dock.header.dispose();
          dock.panel.dispose();
          dock.status.dispose();
          dock.root.remove();
        },
      };
    },
  };
}
