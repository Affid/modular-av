import type { ModularAV } from "@modular-av/api";
import { createLiveKitService } from "./service.ts";
import {
  readSettings,
  registerSecretSettings,
  registerWorldSettings,
  type SettingsApi,
} from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: { settings: SettingsApi; user: { isGM: boolean } };
  var Hooks: { once(hook: string, fn: (...args: never[]) => void): number };
}

const reportError = (error: unknown): void => {
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(
    "Modular A/V: LiveKit |",
    error instanceof Error ? error.message : error,
  );
};

Hooks.once("init", () => {
  registerWorldSettings(game.settings);
});

Hooks.once("setup", () => {
  registerSecretSettings(game.settings, game.user.isGM);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  api.services.register(
    createLiveKitService({
      settings: readSettings(game.settings),
      now: () => Date.now(),
      onError: reportError,
    }),
  );
});
