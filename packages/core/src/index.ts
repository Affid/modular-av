import { installCore } from "./core.ts";
import "./foundry/globals.ts";
import { logError } from "./log.ts";
import { createBrowserMediaEnv } from "./media/browser-env.ts";

Hooks.once("init", () => {
  installCore({
    game,
    hooks: Hooks,
    config: CONFIG,
    foundry,
    ui: () => ui,
    env: createBrowserMediaEnv(),
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    onError: logError,
  });
});
