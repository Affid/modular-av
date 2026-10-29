import type { GateFallback } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** What voice activity mode does when its gate can't run: a client setting. */
export const GATE_FALLBACK_SETTING = "gateFallback";

export const DEFAULT_GATE_FALLBACK: GateFallback = "send";

const isGateFallback = (value: unknown): value is GateFallback =>
  value === "send" || value === "mute";

/** The saved choice; the default for anything malformed. */
export function readGateFallback(game: FoundryGame): GateFallback {
  const value: unknown = game.settings.get(MODULE_ID, GATE_FALLBACK_SETTING);
  return isGateFallback(value) ? value : DEFAULT_GATE_FALLBACK;
}

/** Saves the choice; throws for anything but "send" or "mute". */
export async function writeGateFallback(
  game: FoundryGame,
  fallback: GateFallback,
): Promise<void> {
  if (!isGateFallback(fallback))
    throw new AVCommandError(
      "invalid-argument",
      'The fallback must be "send" or "mute"',
      { fallback: String(fallback) },
    );
  await game.settings.set(MODULE_ID, GATE_FALLBACK_SETTING, fallback);
}
