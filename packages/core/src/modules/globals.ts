import type { ModularAV } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { BoardFoundry } from "./foundry-host.ts";

/** What the board needs from Foundry's globals beyond the core's typing. */
interface BoardGlobals {
  readonly ChatMessage: {
    readonly implementation: { create(data: object): Promise<unknown> };
  };
  readonly foundry: {
    readonly utils: BoardFoundry["utils"];
    readonly applications: {
      readonly settings: {
        /** Foundry's settings window; `initialCategory` picks its tab. */
        readonly SettingsConfig: new (options: object) => {
          render(options?: object): unknown;
        };
      };
    };
  };
}

/** Foundry keeps every registration in `game.settings.settings`, menus apart. */
interface Registrations {
  readonly settings?: ReadonlyMap<
    string,
    { readonly namespace: string; readonly config?: boolean }
  >;
  readonly menus: ReadonlyMap<string, { readonly namespace?: string }>;
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
    settingsWindow: game.webrtc?.config ?? null,
    openFoundrySettings: (category) => {
      const { SettingsConfig } = globals.foundry.applications.settings;
      void new SettingsConfig({ initialCategory: category }).render({
        force: true,
      });
    },
    contributions: () => {
      const api = game.modules.get(MODULE_ID)?.api as ModularAV | undefined;
      return api?.contributions.list() ?? [];
    },
    configured: () => {
      const registered = game.settings as unknown as Registrations;
      const menus = [...registered.menus.values()].flatMap((m) =>
        m.namespace ? [{ namespace: m.namespace, config: true }] : [],
      );
      return [...(registered.settings?.values() ?? []), ...menus];
    },
  };
}
