import { type DockContext, MODULE_ID } from "./context.ts";
import type { Rect } from "@modular-av/kit";

/** Docked on Foundry's dock side, or floating; a window of its own lasts a page. */
export type DockMode = "docked" | "floating";
export type TileLayout = "grid" | "focus";

export const SETTINGS = {
  mode: "mode",
  floatingRect: "floatingRect",
  tileLayout: "tileLayout",
  collapsed: "collapsed",
} as const;

const DEFAULT_RECT: Rect = { left: 80, top: 80, width: 360, height: 420 };

/** Per player (`user` scope, across devices); shown in the dock's own settings. */
export function registerSettings(settings: DockContext["settings"]): void {
  const user = (key: string, type: unknown, value: unknown): void => {
    settings.register(MODULE_ID, key, {
      scope: "user",
      config: false,
      type,
      default: value,
    });
  };
  user(SETTINGS.mode, String, "docked");
  user(SETTINGS.floatingRect, Object, DEFAULT_RECT);
  user(SETTINGS.tileLayout, String, "grid");
  user(SETTINGS.collapsed, Boolean, false);
}

const read = (ctx: DockContext, key: string): unknown =>
  ctx.settings.get(MODULE_ID, key);

export const dockMode = (ctx: DockContext): DockMode =>
  read(ctx, SETTINGS.mode) === "floating" ? "floating" : "docked";

export const tileLayout = (ctx: DockContext): TileLayout =>
  read(ctx, SETTINGS.tileLayout) === "focus" ? "focus" : "grid";

export const isCollapsed = (ctx: DockContext): boolean =>
  read(ctx, SETTINGS.collapsed) === true;

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** The floating dock's box; saved values that aren't one give the default. */
export function floatingRect(ctx: DockContext): Rect {
  const saved = read(ctx, SETTINGS.floatingRect) as Partial<Rect> | null;
  const ok =
    saved !== null &&
    typeof saved === "object" &&
    [saved.left, saved.top, saved.width, saved.height].every(isNumber);
  return ok ? (saved as Rect) : DEFAULT_RECT;
}

export function save(ctx: DockContext, key: string, value: unknown): void {
  ctx.settings.set(MODULE_ID, key, value).catch(ctx.onError);
}
