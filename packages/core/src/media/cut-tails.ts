import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** Whether tails stop with the microphone: a client setting. */
export const CUT_TAILS_SETTING = "cutTails";

export const readCutTails = (game: FoundryGame): boolean =>
  game.settings.get(MODULE_ID, CUT_TAILS_SETTING) === true;

/** Saves the choice; throws for anything but true or false. */
export async function writeCutTails(
  game: FoundryGame,
  cut: boolean,
): Promise<void> {
  if (typeof cut !== "boolean")
    throw new AVCommandError(
      "invalid-argument",
      "The choice must be true or false",
    );
  await game.settings.set(MODULE_ID, CUT_TAILS_SETTING, cut);
}
