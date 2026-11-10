/**
 * Windows a page has only one of each (docs/ARCHITECTURE.md, "How a module plugs in"), so
 * UI modules don't fight over them.
 */

export interface PageWindowRequest {
  /** CSS pixels; the browser may change them. */
  readonly width: number;
  readonly height: number;
  /** Plain text: the window's title. */
  readonly title?: string;
}

/**
 * A window of the page's own. The core gives it the page's styles and keeps
 * them in step (Foundry's theme, stylesheets added later), uses native
 * tooltips in it (Foundry's work only in its own window) and forwards the
 * push to talk key to Foundry.
 */
export interface PageWindow {
  /** The module that asked for it. */
  readonly owner: string;
  readonly window: Window;
  readonly document: Document;
  close(): void;
  /** Runs once when the window closes, however it closes. */
  onClose(listener: () => void): () => void;
}

export interface PageWindows {
  /** This kind of window can open here. */
  supported(): boolean;
  readonly current: PageWindow | null;
  /**
   * Opens the window for `owner`, a module id; it must run from a click or
   * a key press. A window of this kind another module holds closes first
   * (it gets its `onClose`). Rejects with a CommandError: "unsupported"
   * where the browser has none, "forbidden" when the browser refuses (no
   * gesture, a popup blocker).
   */
  request(owner: string, options: PageWindowRequest): Promise<PageWindow>;
  onChange(listener: (current: PageWindow | null) => void): () => void;
}

export type PipRequest = PageWindowRequest;
export type PipWindow = PageWindow;
export type PipWindows = PageWindows;

export interface Windows {
  /**
   * Document Picture-in-Picture: stays on top of every other window, but
   * can't go full screen (browsers turn it off there). Chrome and Edge,
   * on secure pages.
   */
  readonly pip: PageWindows;
  /**
   * A normal window: it can be moved to another monitor and go full
   * screen. Every browser, unless a popup blocker refuses it. It closes
   * when the page goes away.
   */
  readonly popup: PageWindows;
}
