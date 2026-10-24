import type { MediaEnv } from "./env.ts";

export type DeviceKindOf = "audio" | "video";

/** The system default, which Foundry also stores as "default". */
export const DEFAULT_DEVICE = "default";

/** A captured device. `device` is the player's choice, whatever runs. */
export interface Captured {
  readonly device: string;
  readonly raw: MediaStreamTrack;
  /** The choice couldn't be used: the system default runs instead. */
  readonly fallback: boolean;
  /** The browser's own, for a microphone. */
  readonly noiseSuppression: boolean;
}

export const captureRaw = (
  env: Pick<MediaEnv, "captureAudio" | "captureVideo">,
  kind: DeviceKindOf,
  device: string,
  noiseSuppression = true,
): Promise<MediaStreamTrack> =>
  kind === "audio"
    ? env.captureAudio(device, { noiseSuppression })
    : env.captureVideo(device);

/**
 * The chosen device, or the system default when it can't be used (e.g.
 * unplugged), as Discord does; the choice is kept, to return to it. If
 * neither works, rejects with the chosen device's error.
 */
export async function captureDevice(
  env: Pick<MediaEnv, "captureAudio" | "captureVideo">,
  kind: DeviceKindOf,
  device: string,
  noiseSuppression = true,
): Promise<Captured> {
  const of = (raw: MediaStreamTrack, fallback: boolean): Captured => ({
    ...{ device, raw, fallback },
    noiseSuppression,
  });
  try {
    return of(await captureRaw(env, kind, device, noiseSuppression), false);
  } catch (error: unknown) {
    if (device === DEFAULT_DEVICE) throw error;
    try {
      return of(
        await captureRaw(env, kind, DEFAULT_DEVICE, noiseSuppression),
        true,
      );
    } catch {
      throw error;
    }
  }
}
