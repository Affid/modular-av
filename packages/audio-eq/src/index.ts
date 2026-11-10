import type { ModularAV } from "@modular-av/api";
import { registerEq } from "./register.ts";
import { registerSettings } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

// Its settings are the player's, kept through the core: they follow them.
Hooks.once("modularAV.register", (api: ModularAV) => {
  registerEq(api, registerSettings(api.settings));
});
