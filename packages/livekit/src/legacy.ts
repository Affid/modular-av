import { MODULE_ID } from "./settings.ts";

/**
 * LiveKit AVClient (`avclient-livekit`, the module this one replaces) kept
 * its server in a world setting: the address, and the API key and secret
 * as "username" and "password", which every player's browser can read.
 * A GM can bring the address and key over once; the secret then lives
 * only in that GM's browser, as this module keeps it.
 */
export const LEGACY_SETTING = "avclient-livekit.liveKitConnectionSettings";

export type LegacyServer =
  | {
      readonly kind: "custom";
      readonly url: string;
      readonly key: string;
      readonly secret: string;
    }
  /** Tavern's Patreon server, which this module doesn't support. */
  | { readonly kind: "tavern" };

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** A stored value: Foundry v14 hands world settings over parsed, older JSON. */
function parsed(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // Not what the old module stored.
    return null;
  }
}

/** The old module's server, from the world's stored value; null if none. */
export function readLegacyServer(
  getItem: (key: string) => unknown,
): LegacyServer | null {
  const value = parsed(getItem(LEGACY_SETTING));
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Record<string, unknown>;
  if (stored.serverType === "tavern") return { kind: "tavern" };
  const url = text(stored.url);
  const key = text(stored.username);
  const secret = text(stored.password);
  if (!url || !key || !secret) return null;
  return { kind: "custom", url, key, secret };
}

/**
 * The old module connected to `wss://<address>`; a full ws(s) URL stays.
 * Anything else (another scheme, credentials in it) isn't a server's.
 */
export function serverUrlOf(address: string): string | null {
  const value = address.trim();
  if (!value || value.includes("@")) return null;
  if (/^wss?:\/\//i.test(value)) return value;
  // A scheme ("https:", "javascript:"), not a host and port ("host:7880").
  if (value.includes("://") || /^[a-z][\w+.-]*:(?!\d)/i.test(value))
    return null;
  const url = `wss://${value}`;
  return URL.canParse(url) ? url : null;
}

export interface LegacyDeps {
  /** Saves a setting by its full key, e.g. "modular-av-livekit.apiKey". */
  set(key: string, value: unknown): Promise<void>;
  /** Deletes the old module's world setting. */
  removeLegacy(): Promise<void>;
}

export interface ImportResult {
  readonly imported: boolean;
  readonly removed: boolean;
}

/** Saves the old server here: the address for the world, the rest on this device. */
export async function importLegacyServer(
  legacy: Extract<LegacyServer, { kind: "custom" }>,
  options: { readonly removeOld: boolean },
  deps: LegacyDeps,
): Promise<ImportResult> {
  const url = serverUrlOf(legacy.url);
  if (!url) return { imported: false, removed: false };
  await deps.set(`${MODULE_ID}.serverUrl`, url);
  await deps.set(`${MODULE_ID}.apiKey`, legacy.key);
  await deps.set(`${MODULE_ID}.apiSecret`, legacy.secret);
  if (!options.removeOld) return { imported: true, removed: false };
  await deps.removeLegacy();
  return { imported: true, removed: true };
}
