import type { DisplayCapture } from "./env.ts";

/**
 * A share sized for maps, handouts and slides: up to 1080 lines at 15
 * frames a second keeps it sharp, and light enough for a P2P mesh, where
 * each player uploads a copy to every other one.
 */
const SHARE_VIDEO: MediaTrackConstraints = {
  height: { max: 1080 },
  frameRate: { max: 15 },
};

/** Chromium's options beyond the standard ones; other browsers ignore them. */
interface ChromiumDisplayOptions extends DisplayMediaStreamOptions {
  readonly selfBrowserSurface?: "include" | "exclude";
  readonly surfaceSwitching?: "include" | "exclude";
  readonly systemAudio?: "include" | "exclude";
}

/** Opens the browser's picker; the caller is still in the click's activation. */
export async function captureDisplay({
  audio,
}: {
  readonly audio: boolean;
}): Promise<DisplayCapture> {
  const options: ChromiumDisplayOptions = {
    video: SHARE_VIDEO,
    audio,
    // The Foundry tab itself would show the others their own screen.
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    // A tab's sound only: the whole system's would send the call's own
    // voices back to everyone.
    systemAudio: "exclude",
  };
  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  const [video] = stream.getVideoTracks();
  if (!video) {
    for (const track of stream.getTracks()) track.stop();
    throw new DOMException("The picker gave no picture", "NotFoundError");
  }
  // Text and lines over motion: the encoder keeps them readable.
  video.contentHint = "detail";
  return { video, audio: stream.getAudioTracks()[0] ?? null };
}
