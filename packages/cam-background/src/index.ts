import type { ModularAV } from "@modular-av/api";
import { registerBackground } from "./register.ts";
import {
  type CameraBackgroundSettings,
  registerSettings,
  type SettingsApi,
} from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: { settings: SettingsApi };
  var foundry: { utils: { getRoute(path: string): string } };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

let settings: CameraBackgroundSettings | null = null;

Hooks.once("init", () => {
  settings = registerSettings(game.settings);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  if (!settings) return;
  registerBackground(api, settings, (path) => foundry.utils.getRoute(path));
});
