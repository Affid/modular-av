import type { ModularAV } from "@modular-av/api";
import { MODULE_ID } from "./models.ts";
import { registerModels } from "./register.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
  var game: {
    settings: {
      register(ns: string, key: string, config: object): void;
      get(ns: string, key: string): unknown;
      set(ns: string, key: string, value: unknown): Promise<unknown>;
    };
  };
}

const IMPORTED = "legacyImported";
let core: ModularAV | null = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, IMPORTED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  core = api;
  registerModels(api);
});

// A player's noise model from LiveKit AVClient, once (see legacy.ts).
Hooks.once("ready", () => {
  const api = core;
  if (!api || game.settings.get(MODULE_ID, IMPORTED) === true) return;
  import("./legacy.ts")
    .then((legacy) =>
      legacy.importLegacy({
        storage: localStorage,
        imported: () => false,
        markImported: async (value) => {
          await game.settings.set(MODULE_ID, IMPORTED, value);
        },
        turnOn: (model) => api.commands.setEffectEnabled(model, true),
      }),
    )
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console -- the console is Foundry's log
      console.error("Modular A/V: Noise cancellation |", error);
    });
});
