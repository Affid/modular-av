import { MODULE_ID } from "../constants.ts";
import { createFoundryBoardHost } from "./foundry-host.ts";
import { boardFoundry } from "./globals.ts";
import { createBoardWindow } from "./window.ts";

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
