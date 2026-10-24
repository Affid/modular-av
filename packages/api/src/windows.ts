/**
 * Windows a page has only one of (handoff §3 "Windows and layers"), so UI
 * modules don't fight over them.
 */

export interface PipRequest {
  /** CSS pixels; the browser may change them. */
  readonly width: number;
  readonly height: number;
  /** Plain text: the window's title. */
  readonly title?: string;
}

/**
 * The page's Document Picture-in-Picture window. The core gives it the
 * page's styles and keeps them in step (Foundry's theme, stylesheets added
 * later), uses native tooltips in it (Foundry's work only in its own
 * window) and forwards the push to talk key to Foundry.
 */
export interface PipWindow {
  /** The module that asked for it. */
  readonly owner: string;
  readonly window: Window;
  readonly document: Document;
  close(): void;
  /** Runs once when the window closes, however it closes. */
  onClose(listener: () => void): () => void;
}

export interface PipWindows {
  /** Document Picture-in-Picture works here (Chrome and Edge, secure pages). */
  supported(): boolean;
  readonly current: PipWindow | null;
  /**
   * Opens the window for `owner`, a module id; it must run from a click or
   * a key press. A window another module holds closes first (it gets its
   * `onClose`). Rejects with a CommandError: "unsupported" where the
   * browser has none, "forbidden" when the browser refuses (no gesture).
   */
  request(owner: string, options: PipRequest): Promise<PipWindow>;
  onChange(listener: (current: PipWindow | null) => void): () => void;
}

export interface Windows {
  readonly pip: PipWindows;
}
