/**
 * What a user document says about voices (issue #28): on the receiving
 * player's, the modules that subscribed on their browser; on each player's,
 * their consent. Any browser writes only its own user's flags, and reads
 * everyone's, so nothing read here is trusted.
 */
import type {
  AudioSource,
  ParticipantId,
  VoiceConsent,
  VoiceConsentChoice,
  VoiceCopyConsent,
  VoiceDecision,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";

export const VOICE_COPIES_FLAG = "voiceCopies";
export const VOICE_CONSENT_FLAG = "voiceConsent";

/** One module's subscriptions on its player's browser, as saved. */
export interface SavedCopy {
  readonly moduleId: string;
  readonly targets: readonly SavedTarget[];
}

export interface SavedTarget {
  readonly participant: ParticipantId;
  readonly sources: readonly AudioSource[];
}

export const CHOICES: readonly VoiceConsentChoice[] = [
  "allow",
  "ask",
  "refuse",
];
export const SOURCES: readonly AudioSource[] = ["microphone", "screen"];

/** A key of the core's texts about voices. */
export const voiceKey = (name: string): string => `${MODULE_ID}.voices.${name}`;

export const NO_CONSENT: VoiceConsent = { choice: "ask", decisions: [] };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const listOf = <T>(value: unknown, read: (item: unknown) => T | null): T[] =>
  Array.isArray(value)
    ? value.map(read).filter((item): item is T => item !== null)
    : [];

function readTarget(value: unknown): SavedTarget | null {
  if (!isRecord(value) || !isId(value.participant)) return null;
  const sources = SOURCES.filter(
    (s) => Array.isArray(value.sources) && value.sources.includes(s),
  );
  return sources.length > 0
    ? { participant: value.participant, sources }
    : null;
}

function readCopy(value: unknown): SavedCopy | null {
  if (!isRecord(value) || !isId(value.moduleId)) return null;
  const targets = listOf(value.targets, readTarget);
  return targets.length > 0 ? { moduleId: value.moduleId, targets } : null;
}

export const readCopies = (value: unknown): readonly SavedCopy[] =>
  listOf(value, readCopy);

function readDecision(value: unknown): VoiceDecision | null {
  if (!isRecord(value) || !isId(value.moduleId) || !isId(value.receiver))
    return null;
  if (typeof value.allow !== "boolean") return null;
  return {
    moduleId: value.moduleId,
    receiver: value.receiver,
    allow: value.allow,
  };
}

export function readConsent(value: unknown): VoiceConsent {
  if (!isRecord(value)) return NO_CONSENT;
  const choice = CHOICES.find((c) => c === value.choice) ?? NO_CONSENT.choice;
  return { choice, decisions: listOf(value.decisions, readDecision) };
}

/** Where a player stands with `moduleId` on `receiver`'s browser. */
export function consentFor(
  consent: VoiceConsent,
  moduleId: string,
  receiver: ParticipantId,
): VoiceCopyConsent {
  const decision = consent.decisions.find(
    (d) => d.moduleId === moduleId && d.receiver === receiver,
  );
  if (decision) return decision.allow ? "allowed" : "refused";
  if (consent.choice === "allow") return "allowed";
  return consent.choice === "refuse" ? "refused" : "asking";
}
