import type { InputSensitivity } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** How the voice gate opens on this device: a client setting. */
export const SENSITIVITY_SETTING = "inputSensitivity";

export const DEFAULT_SENSITIVITY: InputSensitivity = {
  auto: true,
  threshold: -50,
};

const MIN_THRESHOLD = -100;
const MAX_THRESHOLD = 0;

const isThreshold = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= MIN_THRESHOLD &&
  value <= MAX_THRESHOLD;

/** The saved sensitivity; the default for anything malformed. */
export function readSensitivity(game: FoundryGame): InputSensitivity {
  const value: unknown = game.settings.get(MODULE_ID, SENSITIVITY_SETTING);
  const saved = (typeof value === "object" && value !== null ? value : {}) as {
    auto?: unknown;
    threshold?: unknown;
  };
  return {
    auto:
      typeof saved.auto === "boolean" ? saved.auto : DEFAULT_SENSITIVITY.auto,
    threshold: isThreshold(saved.threshold)
      ? saved.threshold
      : DEFAULT_SENSITIVITY.threshold,
  };
}

/** Merges a change into the saved sensitivity; throws for bad input. */
export async function writeSensitivity(
  game: FoundryGame,
  change: Partial<InputSensitivity>,
): Promise<void> {
  if (change.auto !== undefined && typeof change.auto !== "boolean")
    throw new AVCommandError("invalid-argument", "auto must be true or false");
  if (change.threshold !== undefined && !isThreshold(change.threshold))
    throw new AVCommandError(
      "invalid-argument",
      "The threshold must be between -100 and 0 dBFS",
      { threshold: String(change.threshold) },
    );
  const current = readSensitivity(game);
  await game.settings.set(MODULE_ID, SENSITIVITY_SETTING, {
    auto: change.auto ?? current.auto,
    threshold: change.threshold ?? current.threshold,
  });
}
