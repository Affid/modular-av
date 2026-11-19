import { MODULE_ID } from "./service.ts";
import type { JitsiCredentials } from "./token.ts";

/** The slice of `game.settings` this module uses. */
export interface SettingsApi {
  register(
    namespace: string,
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void;
  get(namespace: string, key: string): unknown;
}

/** How players get into the Jitsi server. */
export type Access = "token" | "open";

/** What says where the server is, as the GM typed it (trimmed). */
export interface ServerSettings {
  readonly access: Access;
  readonly serverUrl: string;
  readonly xmppDomain: string;
  readonly mucDomain: string;
}

export interface JitsiSettings {
  access(): Access;
  /** Read into a deployment by `serverOf` (`server-address.ts`), loaded lazily. */
  serverSettings(): ServerSettings;
  /** This device's app id and secret (a GM's browser, tokens only), or null. */
  credentials(): JitsiCredentials | null;
}

const text = (settings: SettingsApi, key: string): string => {
  const value = settings.get(MODULE_ID, key);
  return typeof value === "string" ? value.trim() : "";
};

/**
 * A world setting: each says where the call is. Changed during a call,
 * those in it would stay where it was and newcomers go to the new place
 * (or wait for a token no GM signs any more), so Foundry has everyone
 * reload.
 */
const worldSetting = (key: string): Readonly<Record<string, unknown>> => ({
  name: `${MODULE_ID}.settings.${key}.name`,
  hint: `${MODULE_ID}.settings.${key}.hint`,
  scope: "world",
  config: true,
  type: String,
  requiresReload: true,
});

/**
 * World: every player reads these, so they never hold a secret.
 * `onChange` runs when the access or the address changes.
 */
export function registerWorldSettings(
  settings: SettingsApi,
  onChange: () => void = () => undefined,
): void {
  settings.register(MODULE_ID, "access", {
    ...worldSetting("access"),
    choices: {
      token: `${MODULE_ID}.settings.access.token`,
      open: `${MODULE_ID}.settings.access.open`,
    },
    default: "token",
    onChange,
  });
  settings.register(MODULE_ID, "serverUrl", {
    ...worldSetting("serverUrl"),
    default: "",
    onChange,
  });
  for (const key of ["xmppDomain", "mucDomain"] as const)
    settings.register(MODULE_ID, key, { ...worldSetting(key), default: "" });
}

/**
 * Client scope: stored only in this browser. Shown to GMs only, since
 * only a GM's browser signs tokens.
 */
export function registerSecretSettings(
  settings: SettingsApi,
  isGM: boolean,
): void {
  for (const key of ["appId", "appSecret"] as const)
    settings.register(MODULE_ID, key, {
      name: `${MODULE_ID}.settings.${key}.name`,
      hint: `${MODULE_ID}.settings.${key}.hint`,
      scope: "client",
      config: isGM,
      type: String,
      default: "",
    });
}

export function readSettings(settings: SettingsApi): JitsiSettings {
  const access = (): Access =>
    settings.get(MODULE_ID, "access") === "open" ? "open" : "token";
  return {
    access,
    serverSettings: () => ({
      access: access(),
      serverUrl: text(settings, "serverUrl"),
      xmppDomain: text(settings, "xmppDomain"),
      mucDomain: text(settings, "mucDomain"),
    }),
    credentials() {
      if (access() === "open") return null;
      const appId = text(settings, "appId");
      const appSecret = text(settings, "appSecret");
      return appId && appSecret ? { appId, appSecret } : null;
    },
  };
}
