import type {
  AudioSource,
  AVState,
  ParticipantId,
  Store,
  VoiceCopy,
  VoiceCopyTarget,
} from "@modular-av/api";
import type {
  FoundryI18n,
  FoundryNamespace,
  FoundryNotifications,
} from "../foundry/globals.ts";
import { foundryDialogs } from "./dialogs.ts";
import { voiceKey } from "./flags.ts";
import { type VoiceMessage, voiceSentence } from "./text.ts";

export interface VoiceNoticesDeps {
  readonly store: Store<AVState>;
  readonly selfId: ParticipantId;
  readonly i18n: FoundryI18n;
  readonly notifications: FoundryNotifications;
  readonly DialogV2: FoundryNamespace["applications"]["api"]["DialogV2"];
  readonly userName: (id: ParticipantId) => string;
  readonly decide: (
    moduleId: string,
    receiver: ParticipantId,
    allow: boolean,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

/** A module asking for this player's voice. */
interface Mine {
  readonly copy: VoiceCopy;
  readonly target: VoiceCopyTarget;
}

const keyOf = (copy: VoiceCopy): string => `${copy.receiver}\n${copy.moduleId}`;

function mine(
  copies: readonly VoiceCopy[],
  selfId: ParticipantId,
): ReadonlyMap<string, Mine> {
  return new Map(
    copies.flatMap((copy) =>
      copy.targets
        .filter((t) => t.participant === selfId)
        .map((target) => [keyOf(copy), { copy, target }] as const),
    ),
  );
}

/** What a change of one module's request means for the player. */
export type VoiceAction =
  | { readonly ask: true }
  | {
      readonly message: VoiceMessage;
      readonly sources: readonly AudioSource[];
    }
  | null;

/**
 * Asks while they haven't answered (again when their answers were
 * forgotten); otherwise tells them of each source it starts asking for.
 */
export function voiceAction(
  before: VoiceCopyTarget | undefined,
  now: VoiceCopyTarget,
): VoiceAction {
  const gained = now.sources.filter((s) => !before?.sources.includes(s));
  if (now.consent === "asking")
    return gained.length > 0 || before?.consent !== "asking"
      ? { ask: true }
      : null;
  if (gained.length === 0) return null;
  if (now.consent === "refused") return { message: "refused", sources: gained };
  return { message: before ? "alsoReceives" : "receives", sources: gained };
}

function sentenceFor(
  deps: VoiceNoticesDeps,
  message: VoiceMessage,
  { copy }: Mine,
  sources: readonly AudioSource[],
): string {
  return voiceSentence(deps.i18n, message, {
    title: copy.title,
    receiver:
      copy.receiver === deps.selfId ? null : deps.userName(copy.receiver),
    sources,
  });
}

/**
 * Tells the player each time a module starts receiving their voice or their
 * screen's sound, or that it asked and they refused; asks them, once per
 * module on a browser at a time, while they haven't answered.
 */
export function startVoiceNotices(deps: VoiceNoticesDeps): () => void {
  let seen: ReadonlyMap<string, Mine> = new Map();
  let asking: ReadonlySet<string> = new Set();
  const dialogs = foundryDialogs(deps.DialogV2);
  const { i18n } = deps;

  const ask = (key: string, now: Mine): void => {
    if (asking.has(key)) return;
    asking = new Set(asking).add(key);
    dialogs
      .confirm({
        title: i18n.localize(voiceKey("ask.title")),
        content: sentenceFor(deps, "asks", now, now.target.sources),
        yes: i18n.localize(voiceKey("ask.allow")),
        no: i18n.localize(voiceKey("ask.refuse")),
      })
      .then((answer) =>
        answer === null
          ? undefined
          : deps.decide(now.copy.moduleId, now.copy.receiver, answer),
      )
      .catch(deps.onError)
      .finally(() => {
        asking = new Set([...asking].filter((k) => k !== key));
      });
  };

  const step = (copies: readonly VoiceCopy[]): void => {
    const next = mine(copies, deps.selfId);
    for (const [key, now] of next) {
      const action = voiceAction(seen.get(key)?.target, now.target);
      if (action && "ask" in action) ask(key, now);
      else if (action)
        deps.notifications.info(
          sentenceFor(deps, action.message, now, action.sources),
        );
    }
    seen = next;
  };

  step(deps.store.get().voiceCopies);
  return deps.store.subscribe((s) => s.voiceCopies, step);
}
