/** However long an effect says it rings: a mute must end soon. */
export const MAX_TAIL_HOLD_MS = 3000;

/**
 * Keeps the output open while a tail rings out after the microphone closed.
 * Nothing new reaches an effect by then, so it only carries speech that
 * already went out.
 */
export interface TailHold {
  /**
   * Whether the output stays open: `sending`, or a tail after it. Safe to
   * call at any time. `mayRing` false ends a hold at once.
   */
  update(sending: boolean, mayRing: boolean): boolean;
}

export function createTailHold(deps: {
  /** How long what runs now rings. */
  readonly tailMs: () => number;
  /** A hold ran out. */
  readonly onEnd: () => void;
}): TailHold {
  let wasSending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const end = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const start = (): void => {
    const ms = Math.min(deps.tailMs(), MAX_TAIL_HOLD_MS);
    if (ms <= 0) return;
    timer = setTimeout(() => {
      timer = null;
      deps.onEnd();
    }, ms);
  };

  return {
    update(sending, mayRing) {
      const released = wasSending && !sending;
      wasSending = sending;
      if (sending || !mayRing) end();
      else if (released) start();
      return sending || timer !== null;
    },
  };
}
