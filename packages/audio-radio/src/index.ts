import type { ModularAV } from "@modular-av/api";
import type { SettingsApi } from "@modular-av/kit";
import { registerRadio } from "./register.ts";
import { type RadioSettings, registerSettings } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
  var game: { settings: SettingsApi };
}

let settings: RadioSettings | null = null;

Hooks.once("init", () => {
  settings = registerSettings(game.settings);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  if (settings) registerRadio(api, settings);
});
