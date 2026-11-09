import type { ModularAV } from "@modular-av/api";
import { registerBoost } from "./register.ts";
import { registerSettings } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

// Its settings are kept through the core: see settings.ts for whose each is.
Hooks.once("modularAV.register", (api: ModularAV) => {
  registerBoost(api, registerSettings(api.settings));
});
