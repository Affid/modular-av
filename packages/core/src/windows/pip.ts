import type { PipRequest, PipWindow, PipWindows } from "@modular-av/api";
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
  /**
   * Gives a new window the page's styles, native tooltips and the push to
   * talk key; resolves with its undo. Loads its code lazily.
   */
  preparePip(window: Window): Promise<() => void>;
}

const MAX_SIDE = 4096;

const isSide = (value: unknown): boolean =>
  typeof value === "number" && value > 0 && value <= MAX_SIDE;

function checkRequest(owner: string, options: PipRequest): void {
  if (typeof owner !== "string" || owner === "")
    throw new AVCommandError(
      "invalid-argument",
      "A Picture-in-Picture window needs its owner's module id",
    );
  if (!isSide(options.width) || !isSide(options.height))
    throw new AVCommandError(
      "invalid-argument",
      "A Picture-in-Picture window needs a width and height in pixels",
    );
}

const refused = (error: unknown): AVCommandError =>
  new AVCommandError(
    "forbidden",
    "The browser refused a Picture-in-Picture window: open it from a click",
    {},
    { cause: error },
  );

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

/**
 * The page's one Picture-in-Picture window. A new request closes the
 * window open, whoever asked for it: the player's latest click wins.
 */
export function createPipWindows(
  env: WindowsEnv,
  onError: (error: unknown) => void,
): PipWindows {
  let current: PipWindow | null = null;
  let changes: Listeners<PipWindow | null> = [];
  /** Counts requests: one overtaken while the browser opened it loses. */
  let requests = 0;

  const announce = (): void => {
    for (const { listener } of changes)
      try {
        listener(current);
      } catch (error: unknown) {
        onError(error);
      }
  };

  const open = (owner: string, win: Window, title?: string): PipWindow => {
    let closeListeners: Listeners<void> = [];
    let undo: (() => void) | null = null;
    let closed = false;
    if (title) win.document.title = title;
    const handle: PipWindow = Object.freeze({
      owner,
      window: win,
      document: win.document,
      close: () => {
        win.close();
      },
      onClose: (listener: () => void) =>
        listen(
          () => closeListeners,
          (next) => (closeListeners = next),
          listener,
        ),
    });
    const onClosed = (): void => {
      if (closed) return;
      closed = true;
      win.removeEventListener("pagehide", onClosed);
      undo?.();
      if (current === handle) current = null;
      for (const { listener } of closeListeners)
        try {
          listener();
        } catch (error: unknown) {
          onError(error);
        }
      announce();
    };
    win.addEventListener("pagehide", onClosed);
    env
      .preparePip(win)
      .then((done) => {
        if (closed) done();
        else undo = done;
      })
      .catch(onError);
    return handle;
  };

  return Object.freeze({
    supported: () => env.documentPip() !== null,
    get current() {
      return current;
    },
    async request(owner: string, options: PipRequest) {
      checkRequest(owner, options);
      const pip = env.documentPip();
      if (!pip)
        throw new AVCommandError(
          "unsupported",
          "This browser has no Picture-in-Picture windows for pages",
        );
      current?.close();
      requests += 1;
      const mine = requests;
      let win: Window;
      try {
        win = await pip.requestWindow({
          width: Math.round(options.width),
          height: Math.round(options.height),
        });
      } catch (error: unknown) {
        throw refused(error);
      }
      if (mine !== requests) {
        win.close();
        throw new AVCommandError(
          "forbidden",
          "A newer Picture-in-Picture request took the window",
        );
      }
      current = open(owner, win, options.title);
      announce();
      return current;
    },
    onChange: (listener: (value: PipWindow | null) => void) =>
      listen(
        () => changes,
        (next) => (changes = next),
        listener,
      ),
  });
}
