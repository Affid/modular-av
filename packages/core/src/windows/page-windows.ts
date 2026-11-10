import type {
  PageWindow,
  PageWindowRequest,
  PageWindows,
} from "@modular-av/api";
import { AVCommandError } from "../errors.ts";

/** The browser's `documentPictureInPicture`, as far as the core uses it. */
export interface DocumentPipLike {
  requestWindow(options: {
    readonly width: number;
    readonly height: number;
  }): Promise<Window>;
}

export interface WindowsEnv {
  /** Null where the browser has no Document Picture-in-Picture. */
  documentPip(): DocumentPipLike | null;
  /** A blank same-origin popup (`window.open`); null when it was refused. */
  openPopup(features: string): Window | null;
  /** The page is going away (its `pagehide`). */
  onPageHide(listener: () => void): () => void;
  /**
   * Gives a new window the page's styles, native tooltips and the push to
   * talk key; resolves with its undo. Loads its code lazily.
   */
  prepareWindow(window: Window): Promise<() => void>;
}

/** How one kind of window opens: rejects with an AVCommandError. */
interface Opener {
  supported(): boolean;
  open(size: {
    readonly width: number;
    readonly height: number;
  }): Promise<Window>;
}

const MAX_SIDE = 4096;
/** A closed window may not say so (no `pagehide`): looked at this often. */
const CLOSED_CHECK_MS = 1000;

const isSide = (value: unknown): boolean =>
  typeof value === "number" && value > 0 && value <= MAX_SIDE;

function checkRequest(owner: string, options: PageWindowRequest): void {
  if (typeof owner !== "string" || owner === "")
    throw new AVCommandError(
      "invalid-argument",
      "A window needs its owner's module id",
    );
  if (!isSide(options.width) || !isSide(options.height))
    throw new AVCommandError(
      "invalid-argument",
      "A window needs a width and height in pixels",
    );
}

type Listeners<T> = readonly { readonly listener: (value: T) => void }[];

function listen<T>(
  get: () => Listeners<T>,
  set: (next: Listeners<T>) => void,
  listener: (value: T) => void,
): () => void {
  const registration = { listener };
  set([...get(), registration]);
  return () => {
    set(get().filter((r) => r !== registration));
  };
}

function tell<T>(
  listeners: Listeners<T>,
  value: T,
  onError: (error: unknown) => void,
): void {
  for (const { listener } of listeners)
    try {
      listener(value);
    } catch (error: unknown) {
      onError(error);
    }
}

/** A handle on `win` that calls `closed` once, however the window closes. */
function handleFor(
  env: WindowsEnv,
  win: Window,
  request: { readonly owner: string; readonly title?: string },
  deps: { readonly onError: (e: unknown) => void; readonly closed: () => void },
): PageWindow {
  let closeListeners: Listeners<void> = [];
  let undo: (() => void) | null = null;
  let done = false;
  if (request.title) win.document.title = request.title;
  // Also a reload or navigation of the window: closed, it isn't left blank.
  const onClosed = (): void => {
    if (done) return;
    done = true;
    win.close();
    win.removeEventListener("pagehide", onClosed);
    clearInterval(check);
    undo?.();
    tell(closeListeners, undefined, deps.onError);
    deps.closed();
  };
  const check = setInterval(() => {
    if (win.closed) onClosed();
  }, CLOSED_CHECK_MS);
  win.addEventListener("pagehide", onClosed);
  env
    .prepareWindow(win)
    .then((ready) => {
      if (done) ready();
      else undo = ready;
    })
    .catch(deps.onError);
  return Object.freeze({
    owner: request.owner,
    window: win,
    document: win.document,
    close: onClosed,
    onClose: (listener: () => void) =>
      listen(
        () => closeListeners,
        (next) => (closeListeners = next),
        listener,
      ),
  });
}

/**
 * The page's one window of a kind. A new request closes the window open,
 * whoever asked for it: the player's latest click wins.
 */
function createPageWindows(
  env: WindowsEnv,
  opener: Opener,
  onError: (error: unknown) => void,
): PageWindows {
  let current: PageWindow | null = null;
  let changes: Listeners<PageWindow | null> = [];
  /** Counts requests: one overtaken while the browser opened it loses. */
  let requests = 0;
  const announce = (): void => {
    tell(changes, current, onError);
  };

  return Object.freeze({
    supported: () => opener.supported(),
    get current() {
      return current;
    },
    async request(owner: string, options: PageWindowRequest) {
      checkRequest(owner, options);
      current?.close();
      requests += 1;
      const mine = requests;
      const win = await opener.open({
        width: Math.round(options.width),
        height: Math.round(options.height),
      });
      if (mine !== requests) {
        win.close();
        throw new AVCommandError(
          "forbidden",
          "A newer request took the window",
        );
      }
      const handle: PageWindow = handleFor(
        env,
        win,
        { owner, ...(options.title ? { title: options.title } : {}) },
        {
          onError,
          closed: () => {
            if (current !== handle) return;
            current = null;
            announce();
          },
        },
      );
      current = handle;
      announce();
      return handle;
    },
    onChange: (listener: (value: PageWindow | null) => void) =>
      listen(
        () => changes,
        (next) => (changes = next),
        listener,
      ),
  });
}

export function createPipWindows(
  env: WindowsEnv,
  onError: (error: unknown) => void,
): PageWindows {
  return createPageWindows(
    env,
    {
      supported: () => env.documentPip() !== null,
      async open(size) {
        const pip = env.documentPip();
        if (!pip)
          throw new AVCommandError(
            "unsupported",
            "This browser has no Picture-in-Picture windows for pages",
          );
        try {
          return await pip.requestWindow(size);
        } catch (error: unknown) {
          throw new AVCommandError(
            "forbidden",
            "The browser refused a Picture-in-Picture window: open it from a click",
            {},
            { cause: error },
          );
        }
      },
    },
    onError,
  );
}

/** Closed with the page: a popup would outlive the call it shows. */
export function createPopupWindows(
  env: WindowsEnv,
  onError: (error: unknown) => void,
): PageWindows {
  const popups = createPageWindows(
    env,
    {
      supported: () => true,
      open({ width, height }) {
        const features = `popup,width=${String(width)},height=${String(height)}`;
        const win = env.openPopup(features);
        if (win) return Promise.resolve(win);
        return Promise.reject(
          new AVCommandError(
            "forbidden",
            "The browser refused a window: open it from a click, and allow popups for this site",
          ),
        );
      },
    },
    onError,
  );
  // Listened to only while a popup is open.
  let off: (() => void) | null = null;
  popups.onChange((current) => {
    if (current && !off)
      off = env.onPageHide(() => {
        popups.current?.close();
      });
    if (!current && off) {
      off();
      off = null;
    }
  });
  return popups;
}
