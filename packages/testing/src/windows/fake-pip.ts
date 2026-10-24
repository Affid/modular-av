/**
 * A stand-in for the browser's `documentPictureInPicture` (Chrome's
 * Document Picture-in-Picture): one window at a time, which fires
 * `pagehide` when it closes, as the real one does. With a DOM (happy-dom)
 * each window has a real document of its own.
 */

export interface FakePipOptions {
  readonly width?: number;
  readonly height?: number;
}

export interface FakeDocumentPip {
  requestWindow(options?: FakePipOptions): Promise<Window>;
  readonly window: Window | null;
  /** Every request so far. */
  readonly requests: readonly FakePipOptions[];
  /** Makes requests reject with this DOMException name, or succeed again. */
  deny(name: string | null): void;
  /** Plays the player closing the window. */
  closeByUser(): void;
}

type Listener = () => void;

function createFakeWindow(onClosed: () => void): Window {
  const doc =
    typeof document === "undefined"
      ? ({} as Document)
      : document.implementation.createHTMLDocument("");
  let listeners: readonly { type: string; listener: Listener }[] = [];
  let closed = false;
  const fake = {
    document: doc,
    get closed() {
      return closed;
    },
    addEventListener(type: string, listener: Listener) {
      listeners = [...listeners, { type, listener }];
    },
    removeEventListener(type: string, listener: Listener) {
      listeners = listeners.filter(
        (l) => l.type !== type || l.listener !== listener,
      );
    },
    close() {
      if (closed) return;
      closed = true;
      for (const l of listeners.filter((x) => x.type === "pagehide"))
        l.listener();
      onClosed();
    },
  };
  return fake as unknown as Window;
}

export function createFakeDocumentPip(): FakeDocumentPip {
  let current: Window | null = null;
  let requests: readonly FakePipOptions[] = [];
  let denied: string | null = null;
  return {
    requestWindow(options = {}) {
      requests = [...requests, options];
      if (denied) return Promise.reject(new DOMException("Denied", denied));
      // Like Chrome, a new window replaces the one open.
      current?.close();
      const made = createFakeWindow(() => {
        if (current === made) current = null;
      });
      current = made;
      return Promise.resolve(made);
    },
    get window() {
      return current;
    },
    get requests() {
      return requests;
    },
    deny(name) {
      denied = name;
    },
    closeByUser() {
      current?.close();
    },
  };
}
