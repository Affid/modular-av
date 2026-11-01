import type { Previews } from "@modular-av/api";

/** What needs no call: the voice preview is the call's own audio. */
export type DevicePreviews = Omit<Previews, "voice">;

/**
 * Previews load their code on first use: the core's entry stays small. A
 * failed load (say, offline) is tried again on the next preview.
 */
export function lazyPreviews(
  load: () => Promise<DevicePreviews>,
  voice: Previews["voice"],
): Previews {
  let loaded: Promise<DevicePreviews> | null = null;
  const previews = (): Promise<DevicePreviews> =>
    (loaded ??= load().catch((error: unknown) => {
      loaded = null;
      throw error;
    }));
  const lazy: Previews = {
    camera: async (element, options) =>
      (await previews()).camera(element, options),
    microphone: async (element, options) =>
      (await previews()).microphone(element, options),
    voice,
  };
  return Object.freeze(lazy);
}
