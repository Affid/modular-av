/** What Foundry and the modules call on the settings window. */
export interface Openable {
  render(options?: object): unknown;
}

/** The loaded window, as tests and the wrapper reach it. */
interface LoadedWindow extends Openable {
  readonly element: HTMLElement | null;
  readonly options: object;
  close(options?: object): Promise<unknown>;
}

/**
 * The core's settings window, its code loaded on first open so the
 * core's entry stays small. Foundry only renders it (`game.webrtc.config`);
 * if its code can't load, Foundry's own window opens instead.
 */
export function lazySettingsWindow(
  load: () => Promise<LoadedWindow>,
  fallback: Openable,
  onError: (error: unknown) => void,
): Openable & Partial<LoadedWindow> {
  let loading: Promise<LoadedWindow> | null = null;
  let loaded: LoadedWindow | null = null;
  const get = (): Promise<LoadedWindow> =>
    (loading ??= load().then((window) => {
      loaded = window;
      return window;
    }));
  return {
    render: (options) =>
      get()
        .then((window) => window.render(options))
        .catch((error: unknown) => {
          // Tried again next time: a failed load isn't kept.
          loading = null;
          onError(error);
          return fallback.render({ force: true });
        }),
    close: (options) => loaded?.close(options) ?? Promise.resolve(),
    get element() {
      return loaded?.element ?? null;
    },
    get options() {
      return loaded?.options ?? {};
    },
  };
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
