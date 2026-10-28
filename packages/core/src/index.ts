import { IMPORTED_SETTING, MODULE_ID } from "./constants.ts";
import { installCore } from "./core.ts";
import "./foundry/globals.ts";
import { logError } from "./log.ts";
import { createBrowserMediaEnv } from "./media/browser-env.ts";
import {
  checkIsDue,
  noServiceIsDue,
  registerModulesMenu,
} from "./modules/menu.ts";
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
    // A GM hears once that no service module is enabled (until dismissed).
    if (noServiceIsDue(game, installed.api.services.list().length))
      import("./modules/notice.ts")
        .then(({ showNoServiceNotice }) => showNoServiceNotice())
        .catch(logError);
    // A GM's browser asks GitHub for news at most once a day (if allowed).
    if (checkIsDue(game, Date.now()))
      import("./modules/news.ts")
        .then(({ runNewsCheck }) => {
          runNewsCheck(logError);
        })
        .catch(logError);
    // Once per player: its code loads only until then.
    const imported = () =>
      game.settings.get(MODULE_ID, IMPORTED_SETTING) === true;
    if (!imported())
      import("./legacy.ts")
        .then(({ importLegacy }) =>
          importLegacy({
            storage: localStorage,
            imported,
            markImported: async (value) => {
              await game.settings.set(MODULE_ID, IMPORTED_SETTING, value);
            },
            setInputSensitivity: (s) =>
              installed.api.commands.setInputSensitivity(s),
          }),
        )
        .catch(logError);
  });
});
