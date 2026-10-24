import { MODULE_ID } from "./constants.ts";
import { installCore } from "./core.ts";
import "./foundry/globals.ts";
import { logError } from "./log.ts";
import { createBrowserMediaEnv } from "./media/browser-env.ts";
import { assetUrl } from "./socket.ts";

Hooks.once("init", () => {
  installCore({
    game,
    hooks: Hooks,
    config: CONFIG,
    foundry,
    ui: () => ui,
    env: createBrowserMediaEnv((path) =>
      assetUrl((p) => foundry.utils.getRoute(p), MODULE_ID, path),
    ),
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    onError: logError,
  });
});
