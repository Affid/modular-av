import type {
  AudioSource,
  AVState,
  ParticipantId,
  VoiceCopy,
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
 * "Voices for modules here: Transcriber (Player1, Me waiting)": whose
 * voices each module asked for, and who declined or hasn't answered yet.
 */
export function receiverLabel(
  t: Translate,
  copies: readonly VoiceCopy[],
  name: (id: ParticipantId) => string,
): string {
  const who = (target: VoiceCopyTarget): string => {
    const shown = name(target.participant);
    if (target.consent === "allowed") return shown;
    const key = target.consent === "refused" ? "declined" : "waiting";
    return t(`voices.${key}`, { name: shown });
  };
  const list = copies
    .map((c) => `${c.title} (${c.targets.map(who).join(", ")})`)
    .join("; ");
  return t("indicator.voice-copies", { list });
}

/** Every module that asked for this player's voice, in the state's order. */
export function myCopies(
  state: AVState,
  selfId: ParticipantId,
): readonly MyCopy[] {
  return state.voiceCopies.flatMap((copy) =>
    copy.targets
      .filter((t) => t.participant === selfId)
      .map((target) => ({ copy, target })),
  );
}

/** "Transcriber (Gamemaster) asks for your voice", or how many asked. */
export function yourVoiceLabel(
  t: Translate,
  mine: readonly MyCopy[],
  name: (id: ParticipantId) => string,
): string {
  const [only] = mine;
  if (!only || mine.length > 1)
    return t("panel.voices.many", { count: String(mine.length) });
  return t(`panel.voices.${only.target.consent}`, {
    module: only.copy.title,
    name: name(only.copy.receiver),
  });
}

/** "your voice", "your screen's sound", or both. */
export function sourcesText(
  t: Translate,
  sources: readonly AudioSource[],
): string {
  const what = sources.length > 1 ? "both" : (sources[0] ?? "microphone");
  return t(`voices.what.${what}`);
}
