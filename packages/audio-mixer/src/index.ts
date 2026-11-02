import type { ModularAV } from "@modular-av/api";
import { registerMenu } from "./menu.ts";
import { registerMixer } from "./register.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
  var game: {
    settings: { registerMenu(module: string, key: string, data: object): void };
    i18n: {
      localize(key: string): string;
      format(key: string, data?: Readonly<Record<string, string>>): string;
    };
    user: { isGM: boolean };
  };
  var foundry: {
    applications: { api: { ApplicationV2: abstract new () => object } };
    utils: { getRoute(path: string): string };
  };
}

let core: ModularAV | null = null;

/** The window and its styles load on first open. */
function open(): void {
  const api = core;
  if (!api) return;
  import("./open.ts")
    .then(({ openMixer }) => {
      openMixer(api, reportError);
    })
    .catch(reportError);
}

Hooks.once("init", () => {
  registerMenu({
    settings: game.settings,
    base: foundry.applications.api.ApplicationV2,
    open,
  });
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  core = api;
  registerMixer(api, open);
});
