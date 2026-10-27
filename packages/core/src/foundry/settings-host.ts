import type { SettingsHost, SettingsSurfaceDefinition } from "@modular-av/api";

type ApplicationBase = abstract new (...args: never[]) => object;

/** The parts of Foundry's ApplicationV2 the window overrides or calls. */
interface ApplicationLike {
  readonly element: HTMLElement | null;
  render(options?: object): Promise<unknown>;
  /** Foundry keeps the window on screen whenever it is positioned. */
  setPosition?(position?: object): unknown;
  close(options?: object): Promise<unknown>;
  _renderHTML(context: object, options: object): Promise<unknown>;
  _replaceHTML(result: unknown, content: HTMLElement, options: object): void;
  _onClose(options: object): void;
}

export interface Openable {
  render(options?: object): unknown;
}

export interface SettingsWindowDeps {
  readonly surface: SettingsSurfaceDefinition;
  /** Already localized: "Voice & Video Settings". */
  readonly title: string;
  /** Foundry's own A/V settings window. */
  readonly foundrySettings: Openable;
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
): Openable {
  const Base = base as unknown as new (...args: unknown[]) => ApplicationLike;
  // Not private members: Foundry's constructor may call overridden methods.
  let filled: HTMLElement | null = null;
  let cleanup: (() => void) | null = null;
  let watching: ResizeObserver | null = null;

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
      position: { width: 560 },
    };

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
      });
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
     * The surface's content can grow after Foundry placed the window: the
     * first time it settles the window is centred again, after that only
     * kept on screen (a window the player moved stays put).
     */
    followContent(content: HTMLElement): ResizeObserver | null {
      const view = content.ownerDocument.defaultView;
      if (!view?.ResizeObserver) return null;
      let centred = false;
      const observer = new view.ResizeObserver(() => {
        this.setPosition?.(centred ? {} : { top: undefined, left: undefined });
        centred = true;
      });
      observer.observe(content.firstElementChild ?? content);
      return observer;
    }

    override _onClose(options: object): void {
      super._onClose(options);
      watching?.disconnect();
      watching = null;
      filled = null;
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

/**
 * Foundry's settings menu opens `new type()` on every click: each opens
 * the one window instead of a second with the same id.
 */
export function menuTypeFor(window: Openable): new () => Openable {
  return class OpenModularAVSettings {
    render(options?: object): unknown {
      return window.render({ force: true, ...options });
    }
  };
}
