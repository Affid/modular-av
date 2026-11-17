import type { AudioSource } from "@modular-av/api";
import type { FoundryI18n } from "../foundry/globals.ts";
import { voiceKey } from "./flags.ts";

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Foundry renders notifications and dialogs as HTML: names stay text. */
export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

export type VoiceMessage = "receives" | "alsoReceives" | "refused" | "asks";

export interface VoiceSentence {
  /** The module's title. */
  readonly title: string;
  /** The receiving player's name; null for this browser's own player. */
  readonly receiver: string | null;
  readonly sources: readonly AudioSource[];
}

/** "Transcriber, on Gamemaster's browser, now receives your voice." */
export function voiceSentence(
  i18n: FoundryI18n,
  message: VoiceMessage,
  { title, receiver, sources }: VoiceSentence,
): string {
  const where =
    receiver === null
      ? i18n.localize(voiceKey("where.self"))
      : i18n.format(voiceKey("where.other"), { name: escapeHtml(receiver) });
  const what = sources.length > 1 ? "both" : (sources[0] ?? "microphone");
  return i18n.format(voiceKey(message), {
    module: escapeHtml(title),
    where,
    what: i18n.localize(voiceKey(`what.${what}`)),
  });
}
