import type { CamerasHost, CamerasPlacement, PipWindow } from "@modular-av/api";
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
export type Where = Side | "floating" | "window";

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
  set(where: Exclude<Where, "window">): Promise<void>;
  /** From a click: the dock moves into the page's Picture-in-Picture window. */
  openWindow(): Promise<void>;
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
 * saved per player) or in the page's Picture-in-Picture window, which
 * lasts until it closes.
 */
export function createPlacement(
  ctx: DockContext,
  host: CamerasHost,
  parts: PlacementParts,
): Placement {
  const { root } = parts;
  /** The side docked on last: Foundry's dock position, until moved. */
  let side: Side = host.placement === "free" ? "left" : host.placement;
  const rest = (): Where => (dockMode(ctx) === "floating" ? "floating" : side);
  let where: Where = rest();
  let pip: PipWindow | null = null;
  let listeners: readonly ((w: Where) => void)[] = [];

  const apply = async (): Promise<void> => {
    root.dataset.placement = where;
    if (where === "floating") placeFloating(root, floatingRect(ctx));
    else clearFloating(root);
    await host.setPlacement(
      where === "floating" || where === "window" ? "free" : where,
    );
    for (const listener of listeners) listener(where);
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
    pip = null;
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
      pip?.close();
      if (next !== "floating") side = next;
      where = next;
      save(ctx, SETTINGS.mode, next === "floating" ? "floating" : "docked");
      await apply();
    },
    async openWindow() {
      const rect = root.getBoundingClientRect();
      const opened = await ctx.api.windows.pip.request(MODULE_ID, {
        width: Math.max(rect.width, MIN_FLOATING.width),
        height: Math.max(rect.height, MIN_FLOATING.height),
        title: ctx.t("dock.windowTitle"),
      });
      pip = opened;
      // Only the window the dock is in brings it back when it closes.
      opened.onClose(() => {
        if (pip === opened) back();
      });
      opened.document.body.append(root);
      where = "window";
      await apply();
    },
    onChange(listener) {
      listeners = [...listeners, listener];
    },
    dispose() {
      for (const step of undo) step();
      view?.removeEventListener("resize", onResize);
      pip?.close();
    },
  };
}
