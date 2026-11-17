import type { AVState } from "@modular-av/api";
import type { FoundryI18n } from "../foundry/globals.ts";
import type { PlayerBadge } from "../status/plain-status.ts";
import { voiceKey } from "./flags.ts";

/**
 * A badge on each player whose browser runs a module receiving voices:
 * "Voices for modules here: Transcriber (Player1, Player2)". Set as text,
 * never as HTML.
 */
export function voiceCopyBadges(
  state: AVState,
  i18n: FoundryI18n,
): PlayerBadge[] {
  const nameOf = (id: string): string => state.participants[id]?.name ?? id;
  const receivers = [...new Set(state.voiceCopies.map((c) => c.receiver))];
  return receivers.map((userId) => {
    const list = state.voiceCopies
      .filter((c) => c.receiver === userId)
      .map(
        (c) =>
          `${c.title} (${c.targets.map((t) => nameOf(t.participant)).join(", ")})`,
      )
      .join("; ");
    return {
      userId,
      data: "voiceCopies",
      icon: "fa-solid fa-ear-listen",
      label: i18n.format(voiceKey("badge"), { list }),
    };
  });
}
