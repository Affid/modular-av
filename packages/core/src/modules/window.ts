import { el } from "@modular-av/kit";
import { MODULE_ID } from "../constants.ts";
import { centreAsContentGrows, type Spot } from "../foundry/centring.ts";
import { type MountedBoard, mountBoard } from "./board/board.ts";
import type { BoardHost } from "./host.ts";

type ApplicationBase = abstract new (...args: never[]) => object;

/** The parts of Foundry's ApplicationV2 the window overrides or calls. */
interface ApplicationLike {
  readonly element: HTMLElement | null;
  readonly position?: Spot;
  render(options?: object): Promise<unknown>;
  /** Foundry keeps the window on screen whenever it is positioned. */
  setPosition?(position?: object): Spot | undefined;
  _renderHTML(context: object, options: object): Promise<unknown>;
  _replaceHTML(result: unknown, content: HTMLElement, options: object): void;
  _onClose(options: object): void;
}

const STYLESHEET_ID = "modular-av-board-styles";

/** The board's styles, added to the page the first time it opens. */
function loadStyles(doc: Document, href: string): void {
  if (doc.getElementById(STYLESHEET_ID)) return;
  doc.head.append(
    el("link", { doc, attrs: { id: STYLESHEET_ID, rel: "stylesheet", href } }),
  );
}

/** Mounts the board in `content`, unless the window closed meanwhile. */
export function fill(
  host: BoardHost,
  content: HTMLElement,
  window: { live(): boolean; mounted(board: MountedBoard): void },
  mount: typeof mountBoard = mountBoard,
): void {
  mount(host, content).then(
    (board) => {
      if (window.live()) window.mounted(board);
      else board.dispose();
    },
    (error: unknown) => {
      host.onError(error);
      if (!window.live()) return;
      content.replaceChildren(
        el("p", { text: host.t(`${MODULE_ID}.modules.failed`) }),
      );
    },
  );
}

/** A Foundry window of its own: moved, resized and closed like any other. */
const windowOptions = (title: string) => ({
  id: `${MODULE_ID}-modules`,
  tag: "section",
  classes: [`${MODULE_ID}-modules`],
  window: { title, icon: "fa-solid fa-puzzle-piece", resizable: true },
  position: { width: 880 },
});

export interface BoardWindowDeps {
  readonly host: BoardHost;
  readonly title: string;
  readonly stylesheet: string;
}

/**
 * The assembly board in a Foundry window (moved, minimized and closed
 * like any other), filled each time it opens.
 */
export function createBoardWindow(
  base: ApplicationBase,
  deps: BoardWindowDeps,
): { render(options?: object): unknown } {
  const Base = base as unknown as new (...args: unknown[]) => ApplicationLike;
  // Not private members: Foundry's constructor may call overridden methods.
  let filled: HTMLElement | null = null;
  let mounted: MountedBoard | null = null;
  let centring: ResizeObserver | null = null;

  class ModularAVModules extends Base {
    static DEFAULT_OPTIONS = windowOptions(deps.title);

    override _renderHTML(): Promise<unknown> {
      return Promise.resolve({});
    }

    override _replaceHTML(_result: unknown, content: HTMLElement): void {
      if (filled === content) return;
      filled = content;
      if (this.element) this.element.style.maxHeight = "calc(100vh - 32px)";
      content.style.overflowY = "auto";
      // Foundry placed the window while it was empty: centred again as the
      // board fills it (the catalog loads, sections open), until moved.
      centring = centreAsContentGrows(this, content);
      loadStyles(content.ownerDocument, deps.stylesheet);
      fill(deps.host, content, {
        // Closed (or opened again) while the catalog loaded: dropped.
        live: () => filled === content,
        mounted: (board) => {
          mounted = board;
        },
      });
    }

    override _onClose(options: object): void {
      super._onClose(options);
      centring?.disconnect();
      centring = null;
      mounted?.dispose();
      mounted = null;
      filled = null;
    }
  }

  return new ModularAVModules();
}
