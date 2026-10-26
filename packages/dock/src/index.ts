import type { ModularAV } from "@modular-av/api";
import { camerasSurface } from "./cameras/dock.ts";
import { createContext, type DockGame, MODULE_ID } from "./context.ts";
import { importLegacy } from "./legacy.ts";
import { reportError } from "./log.ts";
import { playersSurface } from "./players/decorate.ts";
import { registerSettings } from "./settings.ts";
import { settingsSurface } from "./settings-window/surface.ts";
import "../styles/dock.css";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: DockGame & {
    readonly webrtc?: {
      readonly config: { render(options?: object): unknown };
    } | null;
  };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

const IMPORTED = "legacyImported";

Hooks.once("init", () => {
  registerSettings(game.settings);
  game.settings.register(MODULE_ID, IMPORTED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
});

// A player's dock from LiveKit AVClient, once (see legacy.ts).
Hooks.once("ready", () => {
  importLegacy({
    storage: localStorage,
    imported: () => game.settings.get(MODULE_ID, IMPORTED) === true,
    markImported: async (value) => {
      await game.settings.set(MODULE_ID, IMPORTED, value);
    },
    set: async (key, value) => {
      await game.settings.set(MODULE_ID, key, value);
    },
  }).catch(reportError);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  const ctx = createContext({
    game,
    api,
    // The core's settings window, or Foundry's if another module's is chosen.
    openSettings: () => {
      game.webrtc?.config.render({ force: true });
    },
    onError: reportError,
  });
  api.surfaces.register(camerasSurface(ctx));
  api.surfaces.register(settingsSurface(ctx));
  api.surfaces.register(playersSurface(ctx));
});
