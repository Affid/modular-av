import type { LiveKitCredentials } from "./token.ts";

export const MODULE_ID = "modular-av-livekit";

/** The slice of `game.settings` this module uses. */
export interface SettingsApi {
  register(
    namespace: string,
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void;
  get(namespace: string, key: string): unknown;
}

export interface LiveKitSettings {
  /** The server's WebSocket URL, or null when unset or not ws(s). */
  serverUrl(): string | null;
  /** This device's key and secret (a GM's browser), or null. */
  credentials(): LiveKitCredentials | null;
}

const text = (settings: SettingsApi, key: string): string => {
  const value = settings.get(MODULE_ID, key);
  return typeof value === "string" ? value.trim() : "";
};

/** World: every player reads it, so it never holds a secret. */
export function registerWorldSettings(settings: SettingsApi): void {
  settings.register(MODULE_ID, "serverUrl", {
    name: `${MODULE_ID}.settings.serverUrl.name`,
    hint: `${MODULE_ID}.settings.serverUrl.hint`,
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
}

/**
 * Client scope: stored only in this browser. Shown to GMs only, since
 * only a GM's browser signs tokens.
 */
export function registerSecretSettings(
  settings: SettingsApi,
  isGM: boolean,
): void {
  for (const key of ["apiKey", "apiSecret"] as const)
    settings.register(MODULE_ID, key, {
      name: `${MODULE_ID}.settings.${key}.name`,
      hint: `${MODULE_ID}.settings.${key}.hint`,
      scope: "client",
      config: isGM,
      type: String,
      default: "",
    });
}

const WEBSOCKET_URL = /^wss?:\/\/[^\s/?#]+/i;

export function readSettings(settings: SettingsApi): LiveKitSettings {
  return {
    serverUrl() {
      const url = text(settings, "serverUrl");
      return WEBSOCKET_URL.test(url) ? url : null;
    },
    credentials() {
      const apiKey = text(settings, "apiKey");
      const apiSecret = text(settings, "apiSecret");
      return apiKey && apiSecret ? { apiKey, apiSecret } : null;
    },
  };
}
