import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** Whether tails stop with the microphone: a client setting. */
export const CUT_TAILS_SETTING = "cutTails";

export const readCutTails = (game: FoundryGame): boolean =>
  game.settings.get(MODULE_ID, CUT_TAILS_SETTING) === true;
