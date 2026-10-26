import type { ModularAV } from "@modular-av/api";
import { createModuleApi } from "./api.ts";
import { maskSecretField, type FormRoot } from "./mask.ts";
import { createRooms } from "./rooms.ts";
import { createLiveKitService } from "./service.ts";
import type { FoundryForPrompt } from "./legacy-dialog.ts";
import {
  MODULE_ID,
  readSettings,
  registerLegacySetting,
  registerSecretSettings,
  registerWorldSettings,
  type SettingsApi,
} from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: {
    settings: SettingsApi & {
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
      storage: { get(scope: "world"): FoundryForPrompt["worldSettings"] };
    };
    user: { isGM: boolean };
    modules: { get(id: string): { api?: unknown } | undefined };
    i18n: { localize(key: string): string };
  };
  var foundry: {
    applications: { api: { DialogV2: FoundryForPrompt["dialogs"] } };
  };
  var ui: {
    notifications: Record<"info" | "warn", (message: string) => unknown>;
  };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
    on(hook: string, fn: (...args: never[]) => void): number;
  };
}

/** Like the core's log: SDK errors can carry a token in a URL. */
const redact = (text: string): string =>
  text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]")
    .replace(/((?:access_)?token=)[^&\s"']+/gi, "$1[token]");

const reportError = (error: unknown): void => {
  const text = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: LiveKit | ${redact(text)}`);
};

const rooms = createRooms(reportError);

Hooks.once("init", () => {
  registerWorldSettings(game.settings);
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = createModuleApi(rooms.observable);
});

Hooks.once("setup", () => {
  registerSecretSettings(game.settings, game.user.isGM);
  registerLegacySetting(game.settings);
});

/** The setting LiveKit AVClient kept its server in, if this world has it. */
const LEGACY_SETTING = "avclient-livekit.liveKitConnectionSettings";

Hooks.once("ready", () => {
  const world = game.settings.storage.get("world");
  if (!game.user.isGM || !world.getItem(LEGACY_SETTING)) return;
  import("./legacy-dialog.ts")
    .then(({ promptGm }) =>
      promptGm({
        isGM: game.user.isGM,
        worldSettings: world,
        settings: game.settings,
        dialogs: foundry.applications.api.DialogV2,
        notify: (kind, message) => ui.notifications[kind](message),
        localize: (key) => game.i18n.localize(key),
      }),
    )
    .catch(reportError);
});

Hooks.on("renderSettingsConfig", (_app: unknown, element: FormRoot) => {
  maskSecretField(element);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  api.services.register(
    createLiveKitService({
      settings: readSettings(game.settings),
      now: () => Date.now(),
      rooms,
      onError: reportError,
    }),
  );
});
