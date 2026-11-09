/**
 * A stand-in for `window.open` with a blank same-origin popup: each call
 * makes a window that fires `pagehide` when it closes, as a real popup does,
 * or returns null as a popup blocker makes it.
 */
import { createFakeWindow } from "./fake-pip.ts";

export interface FakePopups {
  open(features: string): Window | null;
  /** The windows opened and not yet closed. */
  readonly windows: readonly Window[];
  /** The features string of every call so far. */
  readonly requests: readonly string[];
  /** Makes `open` return null, as a popup blocker does, or work again. */
  block(blocked: boolean): void;
  /** Plays the player closing the newest window. */
  closeByUser(): void;
}

export function createFakePopups(): FakePopups {
  let windows: readonly Window[] = [];
  let requests: readonly string[] = [];
  let blocked = false;
  return {
    open(features) {
      requests = [...requests, features];
      if (blocked) return null;
      const made = createFakeWindow(() => {
        windows = windows.filter((w) => w !== made);
      });
      windows = [...windows, made];
      return made;
    },
    get windows() {
      return windows;
    },
    get requests() {
      return requests;
    },
    block(next) {
      blocked = next;
    },
    closeByUser() {
      windows.at(-1)?.close();
    },
  };
}
