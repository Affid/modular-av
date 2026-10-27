import type { ModularAV } from "@modular-av/api";
import { maskSecretField, type FormRoot } from "./mask.ts";
import { createJitsiService, MODULE_ID, SDK_PATH } from "./service.ts";
import {
  readSettings,
  registerSecretSettings,
  registerWorldSettings,
  type SettingsApi,
} from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: {
    settings: SettingsApi;
    user: { isGM: boolean };
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
    .replace(/((?:access_)?token|jwt)=[^&\s"']+/gi, "$1=[token]");

const reportError = (error: unknown): void => {
  const text = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Jitsi | ${redact(text)}`);
};

const reportLibraryLog = (line: string): void => {
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.warn(`Modular A/V: Jitsi | ${redact(line)}`);
};

Hooks.once("init", () => {
  registerWorldSettings(game.settings);
});

Hooks.once("setup", () => {
  registerSecretSettings(game.settings, game.user.isGM);
});

Hooks.on("renderSettingsConfig", (_app: unknown, element: FormRoot) => {
  maskSecretField(element);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  const settings = readSettings(game.settings);
  api.services.register(
    createJitsiService({
      server: () => settings.server(),
      credentials: () => settings.credentials(),
      sdkUrl: () => api.assetUrl(MODULE_ID, SDK_PATH),
      now: () => Date.now(),
      onError: reportError,
      onLibraryLog: reportLibraryLog,
    }),
  );
});
