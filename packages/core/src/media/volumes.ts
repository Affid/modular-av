import { MODULE_ID, VOLUMES_SETTING } from "../constants.ts";
import type { AVSettingsLike, FoundryGame } from "../foundry/globals.ts";

/**
 * The player's volume for each other player, by user id: a player setting,
 * so it follows them to another address. The core plays from Foundry's own
 * A/V client settings, which stay per browser; this copy fills them in.
 * Loaded with the first change or when the game is ready.
 */
export { VOLUMES_SETTING };

export type Volumes = Readonly<Record<string, number>>;

const isVolume = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 2;

/** The saved volumes; anything malformed is left out. */
export function readVolumes(game: FoundryGame): Volumes {
  const value: unknown = game.settings.get(MODULE_ID, VOLUMES_SETTING);
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      isVolume(entry[1]),
    ),
  );
}

/** Puts the player's volumes where the core plays from; true if one changed. */
export function restoreVolumes(game: FoundryGame, av: AVSettingsLike): boolean {
  const changed = Object.entries(readVolumes(game)).filter(
    ([id, volume]) => (av.client.users[id]?.volume ?? 1) !== volume,
  );
  for (const [id, volume] of changed)
    av.set("client", `users.${id}.volume`, volume);
  return changed.length > 0;
}
