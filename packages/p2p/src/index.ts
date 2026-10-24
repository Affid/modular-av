import { registerSettings, type SettingsApi } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: { settings: SettingsApi };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

Hooks.once("init", () => {
  registerSettings(game.settings);
});
