import type { ModularAV } from "@modular-av/api";
import {
  type AccessFormRoot,
  followAccessChoice,
  maskSecretField,
  type FormRoot,
} from "./mask.ts";
import type { SavedAddressDeps } from "./saved-address.ts";
import { createJitsiService, MODULE_ID, SDK_PATH } from "./service.ts";
import {
  readSettings,
  registerSecretSettings,
  registerWorldSettings,
} from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: {
    settings: SavedAddressDeps["settings"];
    user: { isGM: boolean };
    users: { activeGM: { isSelf: boolean } | null };
    i18n: { localize(key: string): string };
  };
  var ui: { notifications: { warn(message: string): unknown } };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
    on(hook: string, fn: (...args: never[]) => void): number;
  };
}

/**
 * Like the core's log: SDK errors can carry a token in a URL, and an open
 * server's WebSocket address its room, which is all that keeps it private.
 */
const redact = (text: string): string =>
  text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]")
    .replace(/((?:access_)?token|jwt)=[^&\s"']+/gi, "$1=[token]")
    .replace(/([?&]room=)[^&\s"']+/gi, "$1[room]");

const reportError = (error: unknown): void => {
  const text = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Jitsi | ${redact(text)}`);
};

const reportLibraryLog = (line: string): void => {
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.warn(`Modular A/V: Jitsi | ${redact(line)}`);
};

const warn = (key: string): void => {
  ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notices.${key}`));
};

const isActiveGM = (): boolean => game.users.activeGM?.isSelf === true;

/** One notice a minute at most, however many strangers come and go. */
const OUTSIDER_NOTICE_GAP_MS = 60_000;
let lastOutsiderNotice = -Infinity;

const noticeOutsider = (): void => {
  const now = Date.now();
  if (!game.user.isGM || now - lastOutsiderNotice < OUTSIDER_NOTICE_GAP_MS)
    return;
  lastOutsiderNotice = now;
  warn("outsider");
};

/**
 * On the active GM's browser: no token in the address, a room if open.
 * Loaded there only, when the access or the address changes.
 */
const keepAddress = (): void => {
  if (!isActiveGM()) return;
  Promise.all([import("./saved-address.ts"), import("./open-link.ts")])
    .then(([{ keepAddressSafe }, { randomRoom }]) =>
      keepAddressSafe({
        settings: game.settings,
        isActiveGM,
        randomRoom,
        onTokenRemoved: () => {
          warn("tokenRemoved");
        },
      }),
    )
    .catch(reportError);
};

Hooks.once("init", () => {
  registerWorldSettings(game.settings, keepAddress);
});

Hooks.once("setup", () => {
  registerSecretSettings(game.settings, game.user.isGM);
});

Hooks.once("ready", keepAddress);

Hooks.on(
  "renderSettingsConfig",
  (_app: unknown, element: FormRoot & AccessFormRoot) => {
    maskSecretField(element);
    followAccessChoice(element);
  },
);

Hooks.once("modularAV.register", (api: ModularAV) => {
  const settings = readSettings(game.settings);
  api.services.register(
    createJitsiService({
      access: () => settings.access(),
      channel: api.socket("jitsi"),
      onOutsider: noticeOutsider,
      server: async () => {
        const { serverOf } = await import("./server-address.ts");
        return serverOf(settings.serverSettings());
      },
      credentials: () => settings.credentials(),
      sdkUrl: () => api.assetUrl(MODULE_ID, SDK_PATH),
      now: () => Date.now(),
      onError: reportError,
      onLibraryLog: reportLibraryLog,
    }),
  );
});
