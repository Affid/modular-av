import type { Previews } from "@modular-av/api";

/**
 * Previews load their code on first use: the core's entry stays small. A
 * failed load (say, offline) is tried again on the next preview.
 */
export function lazyPreviews(load: () => Promise<Previews>): Previews {
  let loaded: Promise<Previews> | null = null;
  const previews = (): Promise<Previews> =>
    (loaded ??= load().catch((error: unknown) => {
      loaded = null;
      throw error;
    }));
  const lazy: Previews = {
    camera: async (element, options) =>
      (await previews()).camera(element, options),
    microphone: async (element, options) =>
      (await previews()).microphone(element, options),
  };
  return Object.freeze(lazy);
}
