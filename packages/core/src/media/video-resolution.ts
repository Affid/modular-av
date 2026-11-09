import type { VideoResolution } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** The size this device's camera is asked for: a client setting. */
export const VIDEO_RESOLUTION_SETTING = "videoResolution";

export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "default";

const SIZES: Readonly<
  Record<Exclude<VideoResolution, "default">, readonly [number, number]>
> = {
  "360p": [640, 360],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
};

export const isVideoResolution = (value: unknown): value is VideoResolution =>
  value === DEFAULT_VIDEO_RESOLUTION || Object.hasOwn(SIZES, String(value));

/** The saved choice; the default for anything malformed. */
export function readVideoResolution(game: FoundryGame): VideoResolution {
  const value: unknown = game.settings.get(MODULE_ID, VIDEO_RESOLUTION_SETTING);
  return isVideoResolution(value) ? value : DEFAULT_VIDEO_RESOLUTION;
}

/**
 * Only ideal values: a camera that can't do the size gives the nearest it
 * can instead of failing with an OverconstrainedError. The frame rate keeps
 * a camera from trading smoothness for size (some give 1080p at 5 fps).
 */
export function resolutionConstraints(
  resolution: VideoResolution,
): MediaTrackConstraints {
  if (resolution === "default") return {};
  const [width, height] = SIZES[resolution];
  return {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: 30 },
  };
}
