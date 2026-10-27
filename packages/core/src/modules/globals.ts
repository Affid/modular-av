import type { BoardFoundry } from "./foundry-host.ts";

/** What the board needs from Foundry's globals beyond the core's typing. */
interface BoardGlobals {
  readonly ChatMessage: {
    readonly implementation: { create(data: object): Promise<unknown> };
  };
  readonly foundry: {
    readonly utils: BoardFoundry["utils"];
  };
}

/** Foundry, as the board and the news check use it: read from its globals. */
export function boardFoundry(onError: (error: unknown) => void): BoardFoundry {
  const globals = globalThis as unknown as BoardGlobals;
  return {
    game: game as BoardFoundry["game"],
    doc: document,
    chat: globals.ChatMessage.implementation,
    utils: globals.foundry.utils,
    // Absent on pages served over plain HTTP: copying then says so.
    clipboard: (navigator as Partial<Navigator>).clipboard,
    // The options carry no cookies, no referrer and the timeout: keep them.
    fetch: (url, init) => fetch(url, init),
    onError,
  };
}
