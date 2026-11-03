import type { ModularAV } from "@modular-av/api";
import {
  KEPT_OUT_SETTING,
  MODULE_ID,
  PERSONAL_LAYER_FLAG,
  REFUSED_SETTING,
  SOCKET_CHANNEL,
  TABLE_LAYER_SETTING,
  UNDO_SETTING,
} from "./constants.ts";
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
    users: { get(id: string): (FoundryUser & { isGM: boolean }) | undefined };
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
  var ui: {
    notifications: {
      info(message: string, options?: object): void;
      error(message: string, options?: object): void;
    };
  };
}

interface UserChanges {
  readonly flags?: Readonly<Record<string, unknown>>;
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
    .catch((error: unknown) => {
      reportError(error);
      ui.notifications.error(`${MODULE_ID}.loadFailed`, { localize: true });
    });
}

function step(by: 1 | -1): void {
  load()
    .then(async ({ presets }) => {
      const preset = await presets.step(by);
      if (preset)
        ui.notifications.info(`${MODULE_ID}.presets.applied`, {
          format: { name: preset.name },
        });
    })
    .catch(reportError);
}

/** Loads the rest only if a layer is there, or was. */
const hasLayers = (): boolean =>
  Boolean(game.settings.get(MODULE_ID, TABLE_LAYER_SETTING)) ||
  Boolean(game.user.getFlag(MODULE_ID, PERSONAL_LAYER_FLAG)) ||
  Boolean(game.settings.get(MODULE_ID, UNDO_SETTING));

function reconcile(): void {
  load()
    .then(({ layers }) => layers.reconcile())
    .catch(reportError);
}

const clientSetting = (key: string, type: unknown, value: unknown): void => {
  game.settings.register(MODULE_ID, key, {
    scope: "client",
    config: false,
    type,
    default: value,
  });
};

Hooks.once("init", () => {
  clientSetting("activePreset", String, "");
  clientSetting(UNDO_SETTING, String, "");
  clientSetting(REFUSED_SETTING, String, "[]");
  clientSetting(KEPT_OUT_SETTING, Boolean, false);
  game.settings.register(MODULE_ID, TABLE_LAYER_SETTING, {
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: reconcile,
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
  if (own) own.api = macroApi(load);
});

Hooks.once("ready", () => {
  if (hasLayers()) reconcile();
  Hooks.on("updateUser", (user: { id: string }, changes: UserChanges) => {
    if (user.id === game.user.id && changes.flags?.[MODULE_ID]) reconcile();
  });
});
