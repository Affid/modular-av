import type { ModularAV } from "@modular-av/api";
import type { FoundryUi } from "./picker.ts";
import { registerBackground } from "./register.ts";
import {
  type CameraBackgroundSettings,
  MODULE_ID,
  registerSettings,
  type SettingsApi,
} from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: {
    settings: SettingsApi;
    user: { can(permission: string): boolean } | null;
    i18n: { localize(key: string): string };
  };
  var foundry: {
    utils: { getRoute(path: string): string };
    applications: {
      apps: { FilePicker: { implementation: FoundryUi["FilePicker"] } };
      api: { DialogV2: FoundryUi["DialogV2"] };
    };
  };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

let settings: CameraBackgroundSettings | null = null;
let core: ModularAV | null = null;

Hooks.once("init", () => {
  settings = registerSettings(game.settings);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  core = api;
  if (!settings) return;
  registerBackground(api, {
    settings,
    route: (path) => foundry.utils.getRoute(path),
    ui: () => ({
      canBrowseFiles: () => game.user?.can("FILES_BROWSE") ?? false,
      localize: (key) => game.i18n.localize(key),
      FilePicker: foundry.applications.apps.FilePicker.implementation,
      DialogV2: foundry.applications.api.DialogV2,
    }),
  });
});

// A player's camera background from LiveKit AVClient, once (see legacy.ts).
Hooks.once("ready", () => {
  const api = core;
  const own = settings;
  const old = localStorage.getItem("avclient-livekit.videoBackground");
  if (!api || !own || old === null) return;
  if (game.settings.get(MODULE_ID, "legacyImported") === true) return;
  import("./legacy.ts")
    .then(({ importLegacy }) =>
      importLegacy({
        storage: localStorage,
        settings: own,
        turnOn: (effect) => api.commands.setEffectEnabled(effect, true),
      }),
    )
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console -- the console is Foundry's log
      console.error("Modular A/V: Camera background |", error);
    });
});
