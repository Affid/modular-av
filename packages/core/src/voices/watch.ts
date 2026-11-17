import type { AVState, ParticipantId, Store } from "@modular-av/api";

/**
 * Runs `start` once a module first asks for this player's voice (now or
 * later), so what tells and asks them loads only for those it concerns.
 */
export function whenAsked(
  store: Store<AVState>,
  selfId: ParticipantId,
  start: () => void,
): void {
  const asked = (s: AVState): boolean =>
    s.voiceCopies.some((c) => c.targets.some((t) => t.participant === selfId));
  if (asked(store.get())) {
    start();
    return;
  }
  const off = store.subscribe(asked, (now) => {
    if (!now) return;
    off();
    start();
  });
}
