import type {
  AVCommands,
  VoiceConsent,
  VoiceConsentChoice,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import { CHOICES, VOICE_CONSENT_FLAG } from "./flags.ts";
import { consentOf } from "./project.ts";

export type VoiceConsentCommands = Pick<
  AVCommands,
  "setVoiceConsent" | "decideVoiceCopy" | "forgetVoiceDecisions"
>;

function checkChoice(choice: unknown): void {
  if (!CHOICES.some((c) => c === choice))
    throw new AVCommandError(
      "invalid-argument",
      'The choice for voices is "allow", "ask" or "refuse"',
      { choice: typeof choice === "string" ? choice : typeof choice },
    );
}

function checkDecision(
  game: FoundryGame,
  moduleId: unknown,
  receiver: string,
  allow: unknown,
): void {
  if (typeof moduleId !== "string" || moduleId === "")
    throw new AVCommandError("invalid-argument", "A module's id is needed", {
      moduleId: typeof moduleId === "string" ? moduleId : typeof moduleId,
    });
  if (!game.users.get(receiver))
    throw new AVCommandError("unknown-participant", "No such player", {
      participant: receiver,
    });
  if (allow !== null && typeof allow !== "boolean")
    throw new AVCommandError(
      "invalid-argument",
      "An answer is true, false, or null to forget it",
      { allow: typeof allow },
    );
}

/**
 * Saves one change after another, each on top of the one before: Foundry
 * shows a saved flag only after the server answers, so two quick answers
 * would otherwise each start from the old one and the second would win.
 */
function serialSaves(
  game: FoundryGame,
): (change: (consent: VoiceConsent) => VoiceConsent) => Promise<void> {
  let pending: VoiceConsent | null = null;
  let running = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return (change) => {
    running += 1;
    const run = tail
      .then(async () => {
        const next = change(pending ?? consentOf(game.user));
        pending = next;
        await game.user.setFlag(MODULE_ID, VOICE_CONSENT_FLAG, next);
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      })
      .finally(() => {
        running -= 1;
        if (running === 0) pending = null;
      });
    tail = run.catch(() => undefined);
    return run;
  };
}

/** The player's say over their voice, kept on their user for every browser. */
export function createVoiceConsentCommands(
  game: FoundryGame,
): VoiceConsentCommands {
  const save = serialSaves(game);
  return {
    async setVoiceConsent(choice: VoiceConsentChoice) {
      checkChoice(choice);
      await save((consent) => ({ ...consent, choice }));
    },
    async decideVoiceCopy(moduleId: string, receiver: string, allow) {
      checkDecision(game, moduleId, receiver, allow);
      await save((consent) => {
        const others = consent.decisions.filter(
          (d) => d.moduleId !== moduleId || d.receiver !== receiver,
        );
        const decisions =
          allow === null ? others : [...others, { moduleId, receiver, allow }];
        return { ...consent, decisions };
      });
    },
    async forgetVoiceDecisions() {
      await save((consent) => ({ ...consent, decisions: [] }));
    },
  };
}
