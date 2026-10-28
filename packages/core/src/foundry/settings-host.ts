import type {
  SettingsHost,
  SettingsSurfaceDefinition,
  SettingsWindowTab,
} from "@modular-av/api";
import { TABS } from "../contributions.ts";
import type { Openable } from "./lazy-settings-window.ts";

type ApplicationBase = abstract new (...args: never[]) => object;

/** Where a window is, as Foundry's ApplicationV2 keeps it. */
interface Spot {
  readonly top?: number | undefined;
  readonly left?: number | undefined;
}

/** The parts of Foundry's ApplicationV2 the window overrides or calls. */
interface ApplicationLike {
  readonly element: HTMLElement | null;
  readonly options: object;
  readonly position?: Spot;
  render(options?: object): Promise<unknown>;
  /** Foundry keeps the window on screen whenever it is positioned. */
  setPosition?(position?: object): Spot | undefined;
  close(options?: object): Promise<unknown>;
  _renderHTML(context: object, options: object): Promise<unknown>;
  _replaceHTML(result: unknown, content: HTMLElement, options: object): void;
  _onClose(options: object): void;
}

/**
 * The tab a render asks for: `render({ force: true, modularAV: { tab } })`
 * opens the window on it, closing it first if it is open.
 */
function tabIn(options: object | undefined): SettingsWindowTab | undefined {
  const asked = (options as { modularAV?: { tab?: unknown } } | undefined)
    ?.modularAV?.tab;
  return [...TABS, "more" as const].find((tab) => tab === asked);
}

/**
 * Where to put the window each time its content settles: centred again
 * while it is where it was last put (its content loads in steps), left
 * where the player moved it after that, only kept on screen.
 */
export function centreUntilMoved(): {
  next(current: Spot): object;
  placed(spot: Spot | undefined): void;
} {
  let last: Spot | null = null;
  let moved = false;
  return {
    next(current) {
      moved ||=
        last !== null &&
        (current.top !== last.top || current.left !== last.left);
      return moved ? {} : { top: undefined, left: undefined };
    },
    // A copy: Foundry hands back its own position, which it changes later.
    placed(spot) {
      last = spot ? { top: spot.top, left: spot.left } : null;
    },
  };
}

export interface SettingsWindowDeps {
  readonly surface: SettingsSurfaceDefinition;
  /** Already localized: "Voice & Video Settings". */
  readonly title: string;
  /** Foundry's own A/V settings window. */
  readonly foundrySettings: Openable;
  /** The core's modules window, for GMs; absent for players. */
  readonly openModules?: () => void;
  readonly onError: (error: unknown) => void;
}

/**
 * The core's "Voice & Video Settings" window: a Foundry window (moved,
 * minimized and closed like any other) whose content the settings surface
 * fills each time it opens. A surface that throws gets Foundry's own
 * window opened instead.
 */
export function createSettingsWindow(
  base: ApplicationBase,
  deps: SettingsWindowDeps,
): ApplicationLike {
  const Base = base as unknown as new (...args: unknown[]) => ApplicationLike;
  // Not private members: Foundry's constructor may call overridden methods.
  let filled: HTMLElement | null = null;
  let cleanup: (() => void) | null = null;
  let watching: ResizeObserver | null = null;
  let requested: SettingsWindowTab | undefined;
  let tabListeners: readonly ((tab: SettingsWindowTab) => void)[] = [];

  class ModularAVSettings extends Base {
    static DEFAULT_OPTIONS = {
      id: "modular-av-settings",
      tag: "section",
      classes: ["modular-av-settings"],
      window: {
        title: deps.title,
        icon: "fa-solid fa-headset",
        resizable: true,
      },
      position: { width: 760 },
    };

    override render(options?: object): Promise<unknown> {
      const tab = tabIn(options);
      // An open window is told: closing it would lose what is drafted.
      if (tab && filled) for (const listener of tabListeners) listener(tab);
      else requested = tab;
      return super.render(options);
    }

    override _renderHTML(): Promise<unknown> {
      return Promise.resolve({});
    }

    override _replaceHTML(_result: unknown, content: HTMLElement): void {
      if (filled === content) return;
      filled = content;
      // Foundry places a window by its height right after this, and an
      // "auto" height follows the content: cap it at the screen, scroll
      // inside, so it fits, can be moved and shows every section.
      if (this.element) this.element.style.maxHeight = "calc(100vh - 32px)";
      content.style.overflowY = "auto";
      watching = this.followContent(content);
      const host: SettingsHost = Object.freeze({
        content,
        close: async () => {
          await this.close();
        },
        openFoundrySettings: () => {
          deps.foundrySettings.render({ force: true });
        },
        ...(deps.openModules ? { openModules: deps.openModules } : {}),
        ...(requested ? { tab: requested } : {}),
        onTabRequest: (listener: (tab: SettingsWindowTab) => void) => {
          tabListeners = [...tabListeners, listener];
          return () => {
            tabListeners = tabListeners.filter((l) => l !== listener);
          };
        },
      });
      requested = undefined;
      try {
        cleanup = deps.surface.render(host);
      } catch (error: unknown) {
        deps.onError(error);
        queueMicrotask(() => {
          void this.close();
          deps.foundrySettings.render({ force: true });
        });
      }
    }

    /**
     * The surface's content grows after Foundry placed the window (it
     * loads on first open): centred again as it does, until the player
     * moves the window, which then stays put, only kept on screen.
     */
    followContent(content: HTMLElement): ResizeObserver | null {
      const view = content.ownerDocument.defaultView;
      if (!view?.ResizeObserver) return null;
      const follow = centreUntilMoved();
      const observer = new view.ResizeObserver(() => {
        const target = follow.next(this.position ?? {});
        follow.placed(this.setPosition?.(target));
      });
      observer.observe(content.firstElementChild ?? content);
      return observer;
    }

    override _onClose(options: object): void {
      super._onClose(options);
      watching?.disconnect();
      watching = null;
      filled = null;
      tabListeners = [];
      const done = cleanup;
      cleanup = null;
      try {
        done?.();
      } catch (error: unknown) {
        deps.onError(error);
      }
    }
  }

  return new ModularAVSettings();
}
