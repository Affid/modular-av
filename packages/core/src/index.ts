import { MODULE_ID } from "./constants.ts";
import { installCore } from "./core.ts";
import { IMPORTED_SETTING, importLegacy } from "./legacy.ts";
import "./foundry/globals.ts";
import { logError } from "./log.ts";
import { createBrowserMediaEnv } from "./media/browser-env.ts";
import { registerModulesMenu } from "./modules/menu.ts";
import { assetUrl } from "./socket.ts";
import { createBrowserWindows } from "./windows/browser-windows.ts";

Hooks.once("init", () => {
  const installed = installCore({
    game,
    hooks: Hooks,
    config: CONFIG,
    foundry,
    ui: () => ui,
    env: createBrowserMediaEnv((path) =>
      assetUrl((p) => foundry.utils.getRoute(p), MODULE_ID, path),
    ),
    windows: createBrowserWindows(() => game),
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    onError: logError,
  });
  registerModulesMenu({
    game,
    base: foundry.applications.api.ApplicationV2,
    open: () => {
      import("./modules/open.ts")
        .then(({ openBoard }) => {
          openBoard(logError);
        })
        .catch(logError);
    },
  });
  // A player's choices from LiveKit AVClient, once (see legacy.ts).
  game.settings.register(MODULE_ID, IMPORTED_SETTING, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
  Hooks.once("ready", () => {
    importLegacy({
      storage: localStorage,
      imported: () => game.settings.get(MODULE_ID, IMPORTED_SETTING) === true,
      markImported: async (value) => {
        await game.settings.set(MODULE_ID, IMPORTED_SETTING, value);
      },
      setInputSensitivity: (s) => installed.api.commands.setInputSensitivity(s),
    }).catch(logError);
  });
});
