import type { VoiceConsent, VoiceCopy } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryUser } from "../foundry/globals.ts";
import {
  consentFor,
  readConsent,
  readCopies,
  VOICE_CONSENT_FLAG,
  VOICE_COPIES_FLAG,
} from "./flags.ts";

export const consentOf = (user: FoundryUser | undefined): VoiceConsent =>
  readConsent(user?.getFlag(MODULE_ID, VOICE_CONSENT_FLAG));

/** What the world knows of a module: its title, if it is active here. */
export type ActiveModuleTitle = (moduleId: string) => string | null;

/**
 * The modules receiving voices on logged-in players' browsers, from their
 * flags, with where each player whose voice they asked for stands. Only
 * modules active in this world count: a player can't make one up to put
 * words of their own in another's dialog.
 */
export function projectVoiceCopies(
  users: readonly FoundryUser[],
  activeTitle: ActiveModuleTitle,
): readonly VoiceCopy[] {
  const known = new Map(users.map((u) => [u.id, u]));
  return users
    .filter((receiver) => receiver.active)
    .flatMap((receiver) =>
      readCopies(receiver.getFlag(MODULE_ID, VOICE_COPIES_FLAG)).flatMap(
        ({ moduleId, targets }) => {
          const title = activeTitle(moduleId);
          if (title === null) return [];
          const shown = targets
            .filter((t) => known.has(t.participant))
            .map((t) => ({
              ...t,
              consent: consentFor(
                consentOf(known.get(t.participant)),
                moduleId,
                receiver.id,
              ),
            }));
          return shown.length > 0
            ? [
                {
                  receiver: receiver.id,
                  moduleId,
                  title,
                  targets: shown,
                },
              ]
            : [];
        },
      ),
    );
}
