import type { SettingsHost, SettingsSurfaceDefinition } from "@modular-av/api";

type ApplicationBase = abstract new (...args: never[]) => object;

/** The parts of Foundry's ApplicationV2 the window overrides or calls. */
interface ApplicationLike {
  render(options?: object): Promise<unknown>;
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

  class ModularAVSettings extends Base {
    static DEFAULT_OPTIONS = {
      id: "modular-av-settings",
      tag: "section",
      classes: ["modular-av-settings"],
      window: { title: deps.title, icon: "fa-solid fa-headset" },
      position: { width: 560 },
    };

    override _renderHTML(): Promise<unknown> {
      return Promise.resolve({});
    }

    override _replaceHTML(_result: unknown, content: HTMLElement): void {
      if (filled === content) return;
      filled = content;
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

    override _onClose(options: object): void {
      super._onClose(options);
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
