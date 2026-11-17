import { MODULE_ID } from "../constants.ts";
import type { FoundryUser } from "../foundry/globals.ts";
import type {
  AudioSubscription,
  CoreAudioCopies,
} from "../media/audio-copies.ts";
import {
  readCopies,
  type SavedCopy,
  SOURCES,
  VOICE_COPIES_FLAG,
} from "./flags.ts";

/** A failed save is tried again this much later, once. */
const RETRY_MS = 5000;

export interface AnnounceDeps {
  readonly copies: Pick<CoreAudioCopies, "subscriptions" | "onSubscriptions">;
  /** The logged-in user, whose flag this browser writes. */
  readonly user: () => FoundryUser;
  readonly onError: (error: unknown) => void;
}

/** Subscriptions by module, then by participant, as the flag keeps them. */
export function savedCopies(
  subscriptions: readonly AudioSubscription[],
): readonly SavedCopy[] {
  const modules = [...new Set(subscriptions.map((s) => s.moduleId))];
  return modules.map((moduleId) => {
    const own = subscriptions.filter((s) => s.moduleId === moduleId);
    const participants = [...new Set(own.map((s) => s.participant))];
    return {
      moduleId,
      targets: participants.map((participant) => ({
        participant,
        sources: SOURCES.filter((source) =>
          own.some((s) => s.participant === participant && s.source === source),
        ),
      })),
    };
  });
}

/**
 * Keeps the user's flag saying which modules receive voices here: once the
 * game is ready (which also clears what a closed page left), then after
 * each change, joined per moment and only when it differs.
 */
export function announceVoiceCopies(deps: AnnounceDeps): () => void {
  let queued = false;
  // What the flag will hold once writes land: a write still on its way
  // counts, so going back to the saved value before it lands writes again.
  let last = JSON.stringify(
    readCopies(deps.user().getFlag(MODULE_ID, VOICE_COPIES_FLAG)),
  );
  let retried = false;
  const queue = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(write);
  };
  /** A failed save is tried once more; after that, the next change saves. */
  const failed = (json: string, error: unknown): void => {
    deps.onError(error);
    if (last !== json) return;
    last = "";
    if (retried) return;
    retried = true;
    setTimeout(queue, RETRY_MS);
  };
  function write(): void {
    queued = false;
    const next = savedCopies(deps.copies.subscriptions());
    const json = JSON.stringify(next);
    if (json === last) return;
    last = json;
    deps
      .user()
      .setFlag(MODULE_ID, VOICE_COPIES_FLAG, next)
      .then(
        () => {
          retried = false;
        },
        (error: unknown) => {
          failed(json, error);
        },
      );
  }
  write();
  return deps.copies.onSubscriptions(queue);
}
