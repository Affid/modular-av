import type { Stats } from "@modular-av/api";

/**
 * Connection details load their code when first asked for: the core's
 * entry stays small. A failed load (say, offline) is tried again on the
 * next request.
 */
export function lazyStats(load: () => Promise<Stats>): Stats {
  let loaded: Promise<Stats> | null = null;
  const stats = (): Promise<Stats> =>
    (loaded ??= load().catch((error: unknown) => {
      loaded = null;
      throw error;
    }));
  return Object.freeze({
    get: async (participant) => (await stats()).get(participant),
  } satisfies Stats);
}
