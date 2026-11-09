import type {
  CamerasHost,
  CamerasPlacement,
  PageWindow,
} from "@modular-av/api";
import {
  dragToMove,
  dragToResize,
  keepOnScreen,
  type Rect,
  viewportOf,
} from "@modular-av/kit";
import { MODULE_ID, type DockContext } from "../context.ts";
import { dockMode, floatingRect, save, SETTINGS } from "../settings.ts";

export type Side = Exclude<CamerasPlacement, "free">;
/** "window": a popup that can go full screen; "on-top": Picture-in-Picture. */
export type WindowKind = "window" | "on-top";
export type Where = Side | "floating" | "scattered" | WindowKind;

/** Placements outside Foundry's dock: the host leaves no room for them. */
const FREE: ReadonlySet<Where> = new Set([
  "floating",
  "scattered",
  "window",
  "on-top",
]);

const MIN_FLOATING = { width: 220, height: 160 } as const;

export interface PlacementParts {
  readonly root: HTMLElement;
  /** Drags the floating dock with the pointer. */
  readonly handle: HTMLElement;
  /** Moves the floating dock with the arrow keys. */
  readonly move: HTMLElement;
  /** Resizes the floating dock. */
  readonly resize: HTMLElement;
}

export interface Placement {
  readonly where: Where;
  set(where: Exclude<Where, WindowKind>): Promise<void>;
  /** From a click: the dock moves into a window of the page's own. */
  openWindow(kind: WindowKind): Promise<void>;
  onChange(listener: (where: Where) => void): void;
  dispose(): void;
}

const px = (value: number): string => `${String(Math.round(value))}px`;

function placeFloating(root: HTMLElement, rect: Rect): void {
  const shown = keepOnScreen(rect, viewportOf(root));
  Object.assign(root.style, {
    left: px(shown.left),
    top: px(shown.top),
    width: px(shown.width),
    height: px(shown.height),
  });
}

function clearFloating(root: HTMLElement): void {
  for (const property of ["left", "top", "width", "height"])
    root.style.removeProperty(property);
}

/**
 * Where the dock is: docked on Foundry's dock side (the host saves it as
 * Foundry's dock position), floating (moved and resized, kept on screen,
 * saved per player), scattered over the screen (each tile on its own) or
 * in the page's Picture-in-Picture window, which lasts until it closes.
 */
export function createPlacement(
  ctx: DockContext,
  host: CamerasHost,
  parts: PlacementParts,
): Placement {
  const { root } = parts;
  /** The side docked on last: Foundry's dock position, until moved. */
  let side: Side = host.placement === "free" ? "left" : host.placement;
  const rest = (): Where => {
    const mode = dockMode(ctx);
    return mode === "docked" ? side : mode;
  };
  let where: Where = rest();
  let opened: PageWindow | null = null;
  let listeners: readonly ((w: Where) => void)[] = [];

  const apply = async (): Promise<void> => {
    root.dataset.placement = where;
    if (where === "floating") placeFloating(root, floatingRect(ctx));
    else clearFloating(root);
    try {
      await host.setPlacement(FREE.has(where) ? "free" : (where as Side));
    } finally {
      // The dock follows where it is even if Foundry couldn't make room.
      for (const listener of listeners) listener(where);
    }
  };

  const saveRect = (rect: Rect): void => {
    save(ctx, SETTINGS.floatingRect, rect);
  };
  const floating = (): boolean => where === "floating";
  const undo = [
    dragToMove(parts.handle, root, { onEnd: saveRect, enabled: floating }),
    dragToMove(parts.move, root, { onEnd: saveRect, enabled: floating }),
    dragToResize(parts.resize, root, {
      edges: () => ["right", "bottom"],
      min: MIN_FLOATING,
      onEnd: saveRect,
      enabled: floating,
    }),
  ];
  const onResize = (): void => {
    if (where === "floating") placeFloating(root, floatingRect(ctx));
  };
  const view = root.ownerDocument.defaultView;
  view?.addEventListener("resize", onResize);

  const back = (): void => {
    opened = null;
    host.element.append(root);
    where = rest();
    apply().catch(ctx.onError);
  };

  apply().catch(ctx.onError);
  return {
    get where() {
      return where;
    },
    async set(next) {
      opened?.close();
      if (!FREE.has(next)) side = next as Side;
      where = next;
      save(ctx, SETTINGS.mode, FREE.has(next) ? next : "docked");
      await apply();
    },
    async openWindow(kind) {
      const rect = root.getBoundingClientRect();
      const windows = ctx.api.windows[kind === "window" ? "popup" : "pip"];
      const next = await windows.request(MODULE_ID, {
        width: Math.max(rect.width, MIN_FLOATING.width),
        height: Math.max(rect.height, MIN_FLOATING.height),
        title: ctx.t("dock.windowTitle"),
      });
      // One window holds the dock: the other kind closes.
      const previous = opened;
      opened = next;
      previous?.close();
      // Only the window the dock is in brings it back when it closes.
      next.onClose(() => {
        if (opened === next) back();
      });
      next.document.body.append(root);
      where = kind;
      await apply();
    },
    onChange(listener) {
      listeners = [...listeners, listener];
    },
    dispose() {
      for (const step of undo) step();
      view?.removeEventListener("resize", onResize);
      opened?.close();
    },
  };
}
