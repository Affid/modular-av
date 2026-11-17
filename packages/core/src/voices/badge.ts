import type { AVState, VoiceCopy, VoiceCopyConsent } from "@modular-av/api";
import type { FoundryI18n } from "../foundry/globals.ts";
import type { PlayerBadge } from "../status/plain-status.ts";
import { voiceKey } from "./flags.ts";

const key = (name: string): string => voiceKey(`badge.${name}`);

/**
 * "Transcriber receives Player1 (refused: Player2; not answered: you)",
 * the same words as the dock's.
 */
function receives(
  i18n: FoundryI18n,
  copy: VoiceCopy,
  name: (id: string) => string,
): string {
  const names = (consent: VoiceCopyConsent): string =>
    copy.targets
      .filter((t) => t.consent === consent)
      .map((t) => name(t.participant))
      .join(", ");
  const rest = (["refused", "asking"] as const)
    .filter((consent) => names(consent) !== "")
    .map((consent) => i18n.format(key(consent), { names: names(consent) }));
  const allowed = names("allowed");
  const head = allowed
    ? i18n.format(key("receives"), { module: copy.title, names: allowed })
    : i18n.format(key("nobody"), { module: copy.title });
  return rest.length > 0 ? `${head} (${rest.join("; ")})` : head;
}

/**
 * A badge on each player whose browser runs a module receiving voices,
 * saying whose voices and who refused or hasn't answered. Set as text,
 * never as HTML.
 */
export function voiceCopyBadges(
  state: AVState,
  i18n: FoundryI18n,
): PlayerBadge[] {
  const name = (id: string): string => {
    const p = state.participants[id];
    return p?.isLocal ? i18n.localize(key("you")) : (p?.name ?? id);
  };
  const receivers = [...new Set(state.voiceCopies.map((c) => c.receiver))];
  return receivers.map((userId) => {
    const list = state.voiceCopies
      .filter((c) => c.receiver === userId)
      .map((c) => receives(i18n, c, name))
      .join("; ");
    return {
      userId,
      data: "voiceCopies",
      icon: "fa-solid fa-ear-listen",
      label: i18n.format(key("label"), { list }),
    };
  });
}
