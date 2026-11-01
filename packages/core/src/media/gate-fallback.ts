import type { GateFallback } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** What voice activity mode does when its gate can't run: a client setting. */
export const GATE_FALLBACK_SETTING = "gateFallback";

export const DEFAULT_GATE_FALLBACK: GateFallback = "send";

export const isGateFallback = (value: unknown): value is GateFallback =>
  value === "send" || value === "mute";

/** The saved choice; the default for anything malformed. */
export function readGateFallback(game: FoundryGame): GateFallback {
  const value: unknown = game.settings.get(MODULE_ID, GATE_FALLBACK_SETTING);
  return isGateFallback(value) ? value : DEFAULT_GATE_FALLBACK;
}
