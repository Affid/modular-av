import { MODULE_ID } from "../constants.ts";
import { type BoardFoundry, createFoundryBoardHost } from "./foundry-host.ts";
import { createBoardWindow } from "./window.ts";

/** What the board needs from Foundry's globals beyond the core's typing. */
interface BoardGlobals {
  readonly ChatMessage: {
    readonly implementation: { create(data: object): Promise<unknown> };
  };
  readonly foundry: {
    readonly utils: BoardFoundry["utils"];
  };
}

function boardFoundry(onError: (error: unknown) => void): BoardFoundry {
  const globals = globalThis as unknown as BoardGlobals;
  return {
    game: game as BoardFoundry["game"],
    doc: document,
    chat: globals.ChatMessage.implementation,
    utils: globals.foundry.utils,
    // Absent on pages served over plain HTTP: copying then says so.
    clipboard: (navigator as Partial<Navigator>).clipboard,
    fetch: (url) => fetch(url),
    onError,
  };
}

let opened: { render(options?: object): unknown } | null = null;

/** Opens the board, the one window however often it is asked for. */
export function openBoard(onError: (error: unknown) => void): void {
  opened ??= createBoardWindow(foundry.applications.api.ApplicationV2, {
    host: createFoundryBoardHost(boardFoundry(onError)),
    title: game.i18n.localize(`${MODULE_ID}.modules.title`),
    stylesheet: foundry.utils.getRoute(`modules/${MODULE_ID}/styles/board.css`),
  });
  void opened.render({ force: true });
}
