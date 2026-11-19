/** Long enough for a player's claim to come over Foundry's socket. */
export const OUTSIDER_GRACE_MS = 15_000;

export interface OutsidersOptions {
  readonly graceMs: number;
  /** Still in the room, and still vouched for by nobody. */
  readonly isOutsider: (endpoint: string) => boolean;
  readonly onOutsider: (endpoint: string) => void;
}

/**
 * People in an open room whom nobody in the world vouched for: they get
 * no place in the call, but they see and hear it, so each is told of
 * once, after a grace in which a player's claim would have come.
 */
export interface Outsiders {
  watch(endpoint: string): void;
  /** The endpoint left, or was vouched for. */
  forget(endpoint: string): void;
  stop(): void;
}

export function createOutsiders(options: OutsidersOptions): Outsiders {
  let timers: ReadonlyMap<string, ReturnType<typeof setTimeout>> = new Map();
  let told: ReadonlySet<string> = new Set();
  /** Left the room: whoever joins while it closes isn't watched. */
  let stopped = false;

  const drop = (endpoint: string): void => {
    const rest = new Map(timers);
    rest.delete(endpoint);
    timers = rest;
  };

  const check = (endpoint: string): void => {
    drop(endpoint);
    if (!options.isOutsider(endpoint)) return;
    told = new Set(told).add(endpoint);
    options.onOutsider(endpoint);
  };

  return {
    watch(endpoint) {
      if (stopped || timers.has(endpoint) || told.has(endpoint)) return;
      const timer = setTimeout(() => {
        check(endpoint);
      }, options.graceMs);
      timers = new Map(timers).set(endpoint, timer);
    },
    forget(endpoint) {
      const timer = timers.get(endpoint);
      if (timer !== undefined) clearTimeout(timer);
      drop(endpoint);
    },
    stop() {
      stopped = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers = new Map();
    },
  };
}
