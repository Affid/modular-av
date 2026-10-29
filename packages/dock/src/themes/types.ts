/**
 * The dock's public API for themes (`game.modules.get("modular-av-dock").api`),
 * versioned with the dock: a breaking change is a major version.
 */

/** Fired once during Foundry's `setup`: register themes inside it, synchronously. */
export const DOCK_REGISTER_HOOK = "modularAVDock.register";

/** How far something reaches past a tile, per side. */
export interface FrameReach {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * A tile frame, declared: the artwork itself is the theme's CSS on
 * `.mav-dock-tile-frame` (an SVG, or a 9-slice `border-image`), with
 * variants by `[data-anchor]` and by state (`[data-speaking]`…).
 */
export interface FrameDefinition {
  /**
   * How far the artwork reaches past the video on each side, as a fraction
   * of the tile's width, 0 to 0.5: the furthest any variant reaches. The
   * dock sizes the frame layer to it and keeps room for it when fitting
   * tiles and keeping them on screen.
   */
  readonly reach: FrameReach;
}

/** Layouts a theme may suggest; the player is offered it, never moved. */
export type SuggestedLayout = "docked" | "floating" | "scattered";

export interface ThemeDefinition {
  /** Lower case letters, digits and dashes, starting with a letter. */
  readonly id: string;
  /** Plain text or an i18n key. */
  readonly label: string;
  /**
   * The theme's stylesheet, from Foundry's root, e.g.
   * "modules/my-theme/theme.css". Loaded only while the theme is chosen,
   * so it isn't in the module's `styles`. Its rules start with
   * `.mav-theme-<id>` (a class on `<html>` while it is chosen).
   */
  readonly stylesheet: string;
  readonly frames?: FrameDefinition;
  /**
   * A picture of the theme, from Foundry's root, that the dock may show
   * when players choose a theme; this version lists themes by name only.
   */
  readonly preview?: string;
  readonly suggestedLayout?: SuggestedLayout;
}

export interface ThemeRegistry {
  /** Only synchronously inside the `modularAVDock.register` hook. */
  register(theme: ThemeDefinition): void;
  list(): readonly ThemeDefinition[];
  get(id: string): ThemeDefinition | undefined;
}

export interface DockApi {
  readonly themes: ThemeRegistry;
}
