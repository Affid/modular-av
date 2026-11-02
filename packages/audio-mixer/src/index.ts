import type { ModularAV } from "@modular-av/api";
import { MODULE_ID, SOCKET_CHANNEL } from "./constants.ts";
import { registerMenu } from "./menu.ts";
import type { FoundryUser } from "./presets/foundry-store.ts";
import { registerPresetKeys } from "./presets/keys.ts";
import { macroApi } from "./presets/macro.ts";
import { registerMixer } from "./register.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
    on(hook: string, fn: (...args: never[]) => void): number;
    off(hook: string, id: number): void;
  };
  var game: {
    settings: {
      register(module: string, key: string, data: object): void;
      registerMenu(module: string, key: string, data: object): void;
      get(module: string, key: string): unknown;
      set(module: string, key: string, value: unknown): Promise<unknown>;
    };
    keybindings: { register(module: string, key: string, data: object): void };
    i18n: {
      localize(key: string): string;
      format(key: string, data?: Readonly<Record<string, string>>): string;
    };
    modules: { get(id: string): { api?: unknown } | undefined };
    user: FoundryUser & { id: string; isGM: boolean };
    users: { get(id: string): { isGM: boolean } | undefined };
  };
  var foundry: {
    applications: {
      api: {
        ApplicationV2: abstract new () => object;
        DialogV2: {
          confirm(options: object): Promise<unknown>;
        };
      };
    };
    utils: {
      getRoute(path: string): string;
      randomID(): string;
      escapeHTML(text: string): string;
    };
  };
  var ui: { notifications: { info(message: string): void } };
}

let core: ModularAV | null = null;

/** Presets, the window and their styles load when first asked for. */
const load = async () => {
  const api = core;
  if (!api) throw new Error("The core hasn't registered yet");
  const { mixerFor } = await import("./open.ts");
  return mixerFor(api);
};

function open(tab?: "table"): void {
  load()
    .then((mixer) => {
      mixer.open(tab);
    })
    .catch(reportError);
}

function step(by: 1 | -1): void {
  load()
    .then(async ({ presets }) => {
      const preset = await presets.step(by);
      if (preset)
        ui.notifications.info(
          game.i18n.format(`${MODULE_ID}.presets.applied`, {
            name: preset.name,
          }),
        );
    })
    .catch(reportError);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "activePreset", {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
  registerMenu({
    settings: game.settings,
    base: foundry.applications.api.ApplicationV2,
    open,
  });
  registerPresetKeys(game.keybindings, step);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  core = api;
  registerMixer(api, open, () => {
    open("table");
  });
  // Only a GM's asking and the answers to it load the rest.
  api.socket(SOCKET_CHANNEL).on((data, sender) => {
    if (!game.user.isGM && game.users.get(sender)?.isGM !== true) return;
    load()
      .then(({ table }) => {
        table.receive(data, sender);
      })
      .catch(reportError);
  });
  const own = game.modules.get(MODULE_ID);
  if (own) own.api = macroApi(async () => (await load()).presets);
});
