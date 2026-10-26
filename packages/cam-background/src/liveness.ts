import { WorkerError } from "./protocol.ts";

/**
 * A running worker is asked this often whether it is alive; one that
 * closed itself or hangs sends no error, only silence.
 */
export const PING_EVERY_MS = 2_000;
/**
 * Pings in a row left unanswered before it is taken as dead. Counted in
 * pings, not time: a page whose timers were throttled (a hidden tab) asks
 * late, and a live worker still answers before the next.
 */
export const MISSED_PINGS = 3;
/** Silent this long at the usual pace: about 6 s. */
export const DEAD_AFTER_MS = PING_EVERY_MS * MISSED_PINGS;

export interface Liveness {
  /** The worker said something: it is alive. */
  heard(): void;
  stop(): void;
}

/** Pings the worker until stopped; calls `onDead` once if it goes silent. */
export function watchLiveness(
  ping: (id: number) => void,
  onDead: (error: Error) => void,
): Liveness {
  let unanswered = 0;
  let next = 0;
  const timer = setInterval(() => {
    if (unanswered < MISSED_PINGS) {
      unanswered += 1;
      ping((next += 1));
      return;
    }
    clearInterval(timer);
    onDead(
      new WorkerError({
        name: "WorkerError",
        message: "The camera background's worker stopped answering",
      }),
    );
  }, PING_EVERY_MS);
  return {
    heard() {
      unanswered = 0;
    },
    stop() {
      clearInterval(timer);
    },
  };
}
