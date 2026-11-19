import { normalizeAddress } from "./open-link.ts";
import { MODULE_ID } from "./service.ts";
import type { SettingsApi } from "./settings.ts";

export interface SavedAddressDeps {
  readonly settings: SettingsApi & {
    set(namespace: string, key: string, value: unknown): Promise<unknown>;
  };
  /** Only one browser writes: the active GM's. */
  readonly isActiveGM: () => boolean;
  readonly randomRoom: () => string;
  /** A token was taken out of the link: worth telling the GM. */
  readonly onTokenRemoved: () => void;
}

/**
 * Keeps the address setting fit to be read by every player: no token in
 * it, and a room when the server is open (see `normalizeAddress`). Runs
 * after the access or the address changed (and settled: a form saves them
 * one after the other); writing the same value again changes nothing, so
 * the second run stops there.
 */
export async function keepAddressSafe(deps: SavedAddressDeps): Promise<void> {
  if (!deps.isActiveGM()) return;
  const saved = deps.settings.get(MODULE_ID, "serverUrl");
  if (typeof saved !== "string") return;
  const open = deps.settings.get(MODULE_ID, "access") === "open";
  const { value, removedToken } = normalizeAddress(
    saved,
    open,
    deps.randomRoom,
  );
  if (value === saved) return;
  await deps.settings.set(MODULE_ID, "serverUrl", value);
  if (removedToken) deps.onTokenRemoved();
}
