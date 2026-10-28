import { type DockContext, MODULE_ID } from "./context.ts";
import type { Rect } from "@modular-av/kit";
import { THEME_SETTINGS } from "./themes/choice.ts";
import { DEFAULT_THEME } from "./themes/registry.ts";

/**
 * Docked on Foundry's dock side, floating, or scattered over the screen;
 * a window of its own lasts a page.
 */
export type DockMode = "docked" | "floating" | "scattered";
export type TileLayout = "grid" | "focus";

export const SETTINGS = {
  mode: "mode",
  floatingRect: "floatingRect",
  tileLayout: "tileLayout",
  collapsed: "collapsed",
  scattered: "scatteredLayouts",
  dockedSize: "dockedSize",
} as const;

const DEFAULT_RECT: Rect = { left: 80, top: 80, width: 360, height: 420 };

/** Per player (`user` scope, across devices); shown in the dock's own settings. */
export function registerSettings(
  settings: DockContext["settings"],
  onThemeChange: () => void = () => undefined,
): void {
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
  // Docked: the width on a side, the height at the top or bottom; null
  // follows the theme's (cameras/docked-size.ts).
  user(SETTINGS.dockedSize, Object, { width: null, height: null });
  // The scattered layout's arrangements (scattered/arrangement.ts).
  user(SETTINGS.scattered, Object, {
    own: { tiles: {}, panel: null },
    scenes: {},
  });
  // The theme: the player's ("" follows the world's), and the world's.
  settings.register(MODULE_ID, THEME_SETTINGS.own, {
    scope: "user",
    config: false,
    type: String,
    default: "",
    onChange: onThemeChange,
  });
  settings.register(MODULE_ID, THEME_SETTINGS.world, {
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_THEME,
    onChange: onThemeChange,
  });
}

export const read = (ctx: DockContext, key: string): unknown =>
  ctx.settings.get(MODULE_ID, key);

const MODES: readonly DockMode[] = ["docked", "floating", "scattered"];

export const dockMode = (ctx: DockContext): DockMode =>
  MODES.find((m) => m === read(ctx, SETTINGS.mode)) ?? "docked";

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
