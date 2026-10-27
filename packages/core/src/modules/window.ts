import { el } from "@modular-av/kit";
import { MODULE_ID } from "../constants.ts";
import { type MountedBoard, mountBoard } from "./board/board.ts";
import type { BoardHost } from "./host.ts";

type ApplicationBase = abstract new (...args: never[]) => object;

/** The parts of Foundry's ApplicationV2 the window overrides or calls. */
interface ApplicationLike {
  readonly element: HTMLElement | null;
  render(options?: object): Promise<unknown>;
  /** Foundry keeps the window on screen whenever it is positioned. */
  setPosition?(position?: object): unknown;
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

  class ModularAVModules extends Base {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-modules`,
      tag: "section",
      classes: [`${MODULE_ID}-modules`],
      window: {
        title: deps.title,
        icon: "fa-solid fa-puzzle-piece",
        resizable: true,
      },
      position: { width: 880 },
    };

    override _renderHTML(): Promise<unknown> {
      return Promise.resolve({});
    }

    override _replaceHTML(_result: unknown, content: HTMLElement): void {
      if (filled === content) return;
      filled = content;
      if (this.element) this.element.style.maxHeight = "calc(100vh - 32px)";
      content.style.overflowY = "auto";
      loadStyles(content.ownerDocument, deps.stylesheet);
      mountBoard(deps.host, content).then(
        (board) => {
          mounted = board;
          // Foundry placed the window while it was empty: centre it on
          // the board it now holds, capped at the screen.
          this.setPosition?.({ top: undefined, left: undefined });
        },
        (error: unknown) => {
          deps.host.onError(error);
          content.replaceChildren(
            el("p", { text: deps.host.t(`${MODULE_ID}.modules.failed`) }),
          );
        },
      );
    }

    override _onClose(options: object): void {
      super._onClose(options);
      mounted?.dispose();
      mounted = null;
      filled = null;
    }
  }

  return new ModularAVModules();
}
