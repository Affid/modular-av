/** A video frame's size in pixels. */
export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/** How long a frame may take to come: an effect sends once it runs. */
const FRAME_WAIT_MS = 1000;

/**
 * The size of the next frame `track` shows, or null if none comes in time.
 * For a track that reports no size of its own, such as a video effect's
 * output (a MediaStreamTrackGenerator), whose frames follow the camera's.
 */
export async function frameSize(
  track: MediaStreamTrack,
  waitMs = FRAME_WAIT_MS,
): Promise<FrameSize | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = new MediaStream([track]);
  try {
    return await new Promise<FrameSize | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, waitMs);
      video.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(timer);
          const { videoWidth: width, videoHeight: height } = video;
          resolve(width && height ? { width, height } : null);
        },
        { once: true },
      );
      video.play().catch(() => undefined);
    });
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
