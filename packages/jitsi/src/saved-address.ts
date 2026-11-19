import { normalizeAddress, siteAddressOf } from "./open-link.ts";
import { MODULE_ID } from "./service.ts";
import { SETTLED_ADDRESS, type SettingsApi } from "./settings.ts";

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

/** The access and the address as the active GM's browser last left them. */
interface Settled {
  readonly open: boolean;
  readonly address: string;
}

/** What the world keeps as settled, or null for anything else. */
function settledOf(value: unknown): Settled | null {
  if (typeof value !== "object" || value === null) return null;
  const { open, address } = value as Partial<Record<keyof Settled, unknown>>;
  return typeof open === "boolean" && typeof address === "string"
    ? { open, address }
    : null;
}

/**
 * The address as tokens read it, when an open server's access was turned
 * back to tokens and the address saved before it stayed: its room goes.
 * An address saved along with the switch is the GM's choice, kept.
 */
function startingAddress(
  saved: string,
  open: boolean,
  before: Settled | null,
): string {
  const backToTokens =
    before?.open === true && !open && before.address === saved;
  return backToTokens ? siteAddressOf(saved) : saved;
}

/**
 * Keeps the address setting fit to be read by every player: no token in
 * it, a room when the server is open (see `normalizeAddress`), none once
 * tokens are chosen again. Runs when a GM's page is ready and after the
 * access or the address changed (and settled: a form saves them one after
 * the other); writing the same value again changes nothing, so the second
 * run stops there. What it left is kept in the world, where the reload
 * that follows such a change can't clear it.
 */
export async function keepAddressSafe(deps: SavedAddressDeps): Promise<void> {
  if (!deps.isActiveGM()) return;
  const saved = deps.settings.get(MODULE_ID, "serverUrl");
  if (typeof saved !== "string") return;
  const open = deps.settings.get(MODULE_ID, "access") === "open";
  const before = settledOf(deps.settings.get(MODULE_ID, SETTLED_ADDRESS));
  const { value, removedToken } = normalizeAddress(
    startingAddress(saved, open, before),
    open,
    deps.randomRoom,
  );
  if (value !== saved) await deps.settings.set(MODULE_ID, "serverUrl", value);
  if (removedToken) deps.onTokenRemoved();
  if (before?.open !== open || before.address !== value)
    await deps.settings.set(MODULE_ID, SETTLED_ADDRESS, {
      open,
      address: value,
    });
}
