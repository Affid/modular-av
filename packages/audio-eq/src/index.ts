import type { ModularAV } from "@modular-av/api";
import type { SettingsApi } from "@modular-av/kit";
import { registerEq } from "./register.ts";
import { type EqSettings, registerSettings } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
  var game: { settings: SettingsApi };
}

let settings: EqSettings | null = null;

Hooks.once("init", () => {
  settings = registerSettings(game.settings);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  if (settings) registerEq(api, settings);
});
