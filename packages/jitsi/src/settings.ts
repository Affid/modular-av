import type { JitsiServer } from "./join.ts";
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

export interface JitsiSettings {
  /** The deployment, or null when unset or not a usable address. */
  server(): JitsiServer | null;
  /** This device's app id and secret (a GM's browser), or null. */
  credentials(): JitsiCredentials | null;
}

const text = (settings: SettingsApi, key: string): string => {
  const value = settings.get(MODULE_ID, key);
  return typeof value === "string" ? value.trim() : "";
};

const worldText = (key: string): Readonly<Record<string, unknown>> => ({
  name: `${MODULE_ID}.settings.${key}.name`,
  hint: `${MODULE_ID}.settings.${key}.hint`,
  scope: "world",
  config: true,
  type: String,
  default: "",
});

/** World: every player reads these, so they never hold a secret. */
export function registerWorldSettings(settings: SettingsApi): void {
  for (const key of ["serverUrl", "xmppDomain", "mucDomain"] as const)
    settings.register(MODULE_ID, key, worldText(key));
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

/** Loopback, private ranges and .local names: unencrypted is acceptable there. */
const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

const SECURE: Readonly<Record<string, string>> = {
  "https:": "wss:",
  "wss:": "wss:",
};
const PLAIN: Readonly<Record<string, string>> = {
  "http:": "ws:",
  "ws:": "ws:",
};

/**
 * The XMPP WebSocket of a Jitsi site given as its address
 * (https://meet.example.com) or as the WebSocket itself; unencrypted only
 * on this machine or a private network, since every player sends their
 * token to it. Null for anything else.
 */
export function webSocketOf(address: string): URL | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    // Not a URL at all.
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const scheme =
    SECURE[url.protocol] ??
    (LOCAL_HOST.test(url.hostname) ? PLAIN[url.protocol] : undefined);
  if (!scheme) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return new URL(
    `${scheme}//${url.host}${path.endsWith("/xmpp-websocket") ? path : `${path}/xmpp-websocket`}`,
  );
}

/** A host name as XMPP uses it: letters, digits, dots and dashes. */
const DOMAIN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function readSettings(settings: SettingsApi): JitsiSettings {
  return {
    server() {
      const socket = webSocketOf(text(settings, "serverUrl"));
      if (!socket) return null;
      const domain = text(settings, "xmppDomain") || socket.hostname;
      const muc = text(settings, "mucDomain") || `conference.${domain}`;
      if (!DOMAIN.test(domain) || !DOMAIN.test(muc)) return null;
      return { serviceUrl: socket.href, domain, muc };
    },
    credentials() {
      const appId = text(settings, "appId");
      const appSecret = text(settings, "appSecret");
      return appId && appSecret ? { appId, appSecret } : null;
    },
  };
}
