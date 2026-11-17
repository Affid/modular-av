import type {
  AudioSource,
  AVState,
  ParticipantId,
  VoiceCopy,
  VoiceCopyConsent,
  VoiceCopyTarget,
} from "@modular-av/api";
import type { DockContext } from "../context.ts";

type Translate = DockContext["t"];

/** A module that asked for this player's voice, and where they stand with it. */
export interface MyCopy {
  readonly copy: VoiceCopy;
  readonly target: VoiceCopyTarget;
}

export const nameIn =
  (state: AVState) =>
  (id: ParticipantId): string =>
    state.participants[id]?.name ?? id;

/** The modules on `receiver`'s browser. */
export const copiesOn = (
  state: AVState,
  receiver: ParticipantId,
): readonly VoiceCopy[] =>
  state.voiceCopies.filter((c) => c.receiver === receiver);

/**
 * One module for the badge: "Transcriber receives Player1 (refused:
 * Player2; not answered: you)". `name` gives "you" for the viewer.
 */
function receives(
  t: Translate,
  copy: VoiceCopy,
  name: (id: ParticipantId) => string,
): string {
  const names = (consent: VoiceCopyConsent): string =>
    copy.targets
      .filter((target) => target.consent === consent)
      .map((target) => name(target.participant))
      .join(", ");
  const allowed = names("allowed");
  const rest = [
    names("refused") && t("voices.badge.refused", { names: names("refused") }),
    names("asking") && t("voices.badge.asking", { names: names("asking") }),
  ].filter((part) => part !== "");
  const head = allowed
    ? t("voices.badge.receives", { module: copy.title, names: allowed })
    : t("voices.badge.nobody", { module: copy.title });
  return rest.length > 0 ? `${head} (${rest.join("; ")})` : head;
}

/** "Modules here: Transcriber receives Player1 (refused: Player2)". */
export function receiverLabel(
  t: Translate,
  copies: readonly VoiceCopy[],
  name: (id: ParticipantId) => string,
): string {
  const list = copies.map((c) => receives(t, c, name)).join("; ");
  return t("voices.badge.label", { list });
}

/** Names as the viewer reads them: their own is "you". */
export const viewerNames =
  (t: Translate, state: AVState, selfId: ParticipantId) =>
  (id: ParticipantId): string =>
    id === selfId ? t("voices.you") : nameIn(state)(id);

/** Every module that asked for this player's voice, unanswered first. */
export function myCopies(
  state: AVState,
  selfId: ParticipantId,
): readonly MyCopy[] {
  const mine = state.voiceCopies.flatMap((copy) =>
    copy.targets
      .filter((t) => t.participant === selfId)
      .map((target) => ({ copy, target })),
  );
  return [
    ...mine.filter((m) => m.target.consent === "asking"),
    ...mine.filter((m) => m.target.consent !== "asking"),
  ];
}

/** "your voice", "your screen's sound", or both. */
export function sourcesText(
  t: Translate,
  sources: readonly AudioSource[],
): string {
  const what = sources.length > 1 ? "both" : (sources[0] ?? "microphone");
  return t(`voices.what.${what}`);
}

/** "On Gamemaster's browser." or "On your browser." */
export function whereText(
  t: Translate,
  state: AVState,
  selfId: ParticipantId,
  receiver: ParticipantId,
): string {
  return receiver === selfId
    ? t("voices.where.self")
    : t("voices.where.other", { name: nameIn(state)(receiver) });
}

/** The panel's line: its words around the module's title, and its name. */
export interface VoiceLine {
  /** Waiting for an answer: the line stands out. */
  readonly state: "asking" | "allowed" | "refused";
  /** The text before the title, the title, and the text after it. */
  readonly parts: readonly [string, string, string];
  readonly label: string;
}

/** The line's text with `{module}` marked, so only the title is cut short. */
function around(
  text: string,
  title: string,
): readonly [string, string, string] {
  const [before = "", after = ""] = text.split(TITLE);
  return [before, title, after];
}

const TITLE = "\u0000";

/**
 * Several modules: what needs the player, short enough for the panel
 * ("1 module wants your voice"); the whole count in its name.
 */
function summary(
  t: Translate,
  mine: readonly MyCopy[],
  state: VoiceLine["state"],
): VoiceLine {
  const count = (consent: VoiceCopyConsent): number =>
    mine.filter((m) => m.target.consent === consent).length;
  const parts = (["asking", "allowed", "refused"] as const)
    .filter((c) => count(c) > 0)
    .map((c) => t(`panel.voices.count.${c}`, { count: String(count(c)) }))
    .join(", ");
  const n = count(state);
  const text = t(`panel.voices.short.${state}.${n === 1 ? "one" : "many"}`, {
    count: String(n),
  });
  const open = t(
    `panel.voices.open.${state === "asking" ? "answer" : "change"}`,
  );
  const label = `${t("panel.voices.summary", { parts })}. ${open}`;
  return { state, parts: ["", text, ""], label };
}

/**
 * One module: "Transcriber wants your voice". Several: "Your voice: 1 to
 * answer, 1 receiving". The accessible name says it whole.
 */
export function voiceLine(
  t: Translate,
  state: AVState,
  selfId: ParticipantId,
  mine: readonly MyCopy[],
): VoiceLine {
  const waiting = mine.some((m) => m.target.consent === "asking");
  const allRefused = mine.every((m) => m.target.consent === "refused");
  const lineState = waiting ? "asking" : allRefused ? "refused" : "allowed";
  const [only] = mine;
  if (!only || mine.length > 1) return summary(t, mine, lineState);
  const { consent } = only.target;
  const module = only.copy.title;
  const where = t(
    `voices.on.${only.copy.receiver === selfId ? "self" : "other"}`,
    {
      name: nameIn(state)(only.copy.receiver),
    },
  );
  return {
    state: consent,
    parts: around(t(`panel.voices.line.${consent}`, { module: TITLE }), module),
    label: t(`panel.voices.full.${consent}`, { module, where }),
  };
}
