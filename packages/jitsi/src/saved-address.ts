import { normalizeAddress, siteAddressOf } from "./open-link.ts";
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

/** The access and the address as this browser saw them, settled, last time. */
export interface SeenAddress {
  readonly open: boolean;
  readonly address: unknown;
}

/**
 * The address as tokens read it, when an open server's access was turned
 * back to tokens and the address saved before it stayed: its room goes.
 * An address saved along with the switch is the GM's choice, kept.
 */
function startingAddress(
  saved: string,
  open: boolean,
  before: SeenAddress | null,
): string {
  const backToTokens =
    before?.open === true && !open && before.address === saved;
  return backToTokens ? siteAddressOf(saved) : saved;
}

/**
 * Keeps the address setting fit to be read by every player: no token in
 * it, a room when the server is open (see `normalizeAddress`), none once
 * tokens are chosen again. Runs after the access or the address changed
 * (and settled: a form saves them one after the other); writing the same
 * value again changes nothing, so the second run stops there.
 */
export async function keepAddressSafe(
  deps: SavedAddressDeps,
  before: SeenAddress | null = null,
): Promise<void> {
  if (!deps.isActiveGM()) return;
  const saved = deps.settings.get(MODULE_ID, "serverUrl");
  if (typeof saved !== "string") return;
  const open = deps.settings.get(MODULE_ID, "access") === "open";
  const { value, removedToken } = normalizeAddress(
    startingAddress(saved, open, before),
    open,
    deps.randomRoom,
  );
  if (value === saved) return;
  await deps.settings.set(MODULE_ID, "serverUrl", value);
  if (removedToken) deps.onTokenRemoved();
}
