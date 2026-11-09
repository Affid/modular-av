import type { VideoResolution } from "@modular-av/api";
import type { MediaEnv } from "./env.ts";

export type DeviceKindOf = "audio" | "video";

/** The system default, which Foundry also stores as "default". */
export const DEFAULT_DEVICE = "default";

/** How a device is captured, beside which one. */
export interface CaptureOptions {
  /** The browser's own, for a microphone. */
  readonly noiseSuppression: boolean;
  /** The size asked of a camera. */
  readonly resolution: VideoResolution;
}

export const DEFAULT_CAPTURE: CaptureOptions = {
  noiseSuppression: true,
  resolution: "default",
};

/** A captured device. `device` is the player's choice, whatever runs. */
export interface Captured extends CaptureOptions {
  readonly device: string;
  readonly raw: MediaStreamTrack;
  /** The choice couldn't be used: the system default runs instead. */
  readonly fallback: boolean;
}

export const captureRaw = (
  env: Pick<MediaEnv, "captureAudio" | "captureVideo">,
  kind: DeviceKindOf,
  device: string,
  options: CaptureOptions = DEFAULT_CAPTURE,
): Promise<MediaStreamTrack> =>
  kind === "audio"
    ? env.captureAudio(device, { noiseSuppression: options.noiseSuppression })
    : env.captureVideo(device, { resolution: options.resolution });

/**
 * The chosen device, or the system default when it can't be used (e.g.
 * unplugged), as Discord does; the choice is kept, to return to it. If
 * neither works, rejects with the chosen device's error.
 */
export async function captureDevice(
  env: Pick<MediaEnv, "captureAudio" | "captureVideo">,
  kind: DeviceKindOf,
  device: string,
  options: CaptureOptions = DEFAULT_CAPTURE,
): Promise<Captured> {
  const of = (raw: MediaStreamTrack, fallback: boolean): Captured => ({
    ...options,
    ...{ device, raw, fallback },
  });
  try {
    return of(await captureRaw(env, kind, device, options), false);
  } catch (error: unknown) {
    if (device === DEFAULT_DEVICE) throw error;
    try {
      return of(await captureRaw(env, kind, DEFAULT_DEVICE, options), true);
    } catch {
      throw error;
    }
  }
}
