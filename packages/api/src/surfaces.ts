/**
 * Surfaces (handoff §3 "Extension points"): where a UI module shows the
 * call. `cameras` and `settings` are exclusive, picked per world by the GM
 * (a player may override `cameras`) and fixed at load; `players` is
 * additive. The core hosts every surface in Foundry, so UI modules never
 * subclass Foundry's classes.
 */

import type { SettingsWindowTab } from "./contributions.ts";

/**
 * Docked on a side of the screen, saved as Foundry's dock position, or
 * `free`: out of the page's flow (floating, or in a window of its own).
 */
export type CamerasPlacement = "left" | "right" | "top" | "bottom" | "free";

export interface CamerasHost {
  /**
   * The core's camera dock element, which Foundry keeps next to its
   * interface. The surface owns its content.
   */
  readonly element: HTMLElement;
  readonly placement: CamerasPlacement;
  /** Tells Foundry where the cameras are, so its hotbar and chat make room. */
  setPlacement(placement: CamerasPlacement): Promise<void>;
}

export interface MountedSurface {
  /**
   * Undoes the mount completely. The core doesn't call it yet (a surface
   * lives as long as Foundry's page), but a minor version may: tests and a
   * later teardown use it.
   */
  unmount(): void;
}

interface SurfaceBase {
  /** Unique among all surfaces, e.g. "modular-av-dock.cameras". */
  readonly id: string;
  /** Plain text or an i18n key. */
  readonly label: string;
}

export interface CamerasSurfaceDefinition extends SurfaceBase {
  readonly kind: "cameras";
  /**
   * Called once, when Foundry first renders its camera dock. A surface that
   * throws is replaced by Foundry's own dock and the core's plain status.
   * While one is mounted, the core's plain status is off: the UI contract
   * makes the surface show everything it showed.
   */
  mount(host: CamerasHost): MountedSurface;
}

export interface SettingsHost {
  /** The window's content region; the surface owns what goes in it. */
  readonly content: HTMLElement;
  close(): Promise<void>;
  /**
   * Opens Foundry's own A/V settings (the world's mode, the relay server),
   * which the surface replaces as the window players open.
   */
  openFoundrySettings(): void;
  /**
   * GMs only: opens the core's modules window, where a GM plans which
   * Modular A/V modules the world runs. Absent for players.
   */
  openModules?(): void;
  /**
   * The tab to show first, when the window was opened for something on it
   * (the core's modules window does, for a module's settings; "more" for
   * sections that name no tab). Absent: the surface's own first tab.
   */
  readonly tab?: SettingsWindowTab;
  /**
   * Called when a tab is asked for while the window is open: the surface
   * shows it, keeping what is drafted. Returns the unsubscribe. A surface
   * that doesn't listen keeps its tab.
   */
  onTabRequest?(listener: (tab: SettingsWindowTab) => void): () => void;
}

export interface SettingsSurfaceDefinition extends SurfaceBase {
  readonly kind: "settings";
  /**
   * Fills the core's "Voice & Video Settings" window each time it opens,
   * from Foundry's settings menu or `game.webrtc.config`; the returned
   * function runs when it closes.
   */
  render(host: SettingsHost): () => void;
}

export interface PlayersSurfaceDefinition extends SurfaceBase {
  readonly kind: "players";
  /**
   * Called each time Foundry renders its player list. While one is
   * registered, the core adds no badges of its own.
   */
  decorate(list: HTMLElement): void;
}

export type SurfaceDefinition =
  | CamerasSurfaceDefinition
  | SettingsSurfaceDefinition
  | PlayersSurfaceDefinition;

export type SurfaceKind = SurfaceDefinition["kind"];
