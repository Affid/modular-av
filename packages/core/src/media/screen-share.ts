import type { DisplayCapture, MediaEnv } from "./env.ts";

/** The local player's shared screen: what the picker gave, until it stops. */
export interface ScreenShare {
  readonly video: MediaStreamTrack | null;
  readonly audio: MediaStreamTrack | null;
  /**
   * Opens the picker before anything else (it needs the click's user
   * activation), then shares what was picked in place of a running share.
   * A rejected pick leaves the running share as it was.
   */
  start(audio: boolean): Promise<void>;
  /** Stops and frees the shared screen. */
  stop(): void;
  /** The share started, stopped or lost its sound. */
  onChange(listener: () => void): () => void;
}

const stopAll = (capture: DisplayCapture): void => {
  capture.video.stop();
  capture.audio?.stop();
};

export function createScreenShare(
  env: Pick<MediaEnv, "captureDisplay">,
): ScreenShare {
  let current: DisplayCapture | null = null;
  let unwatch = (): void => undefined;
  /** Counts starts and stops: a pick that resolves after either is dropped. */
  let generation = 0;
  let listeners: readonly { readonly listener: () => void }[] = [];

  const notify = (): void => {
    for (const { listener } of listeners) listener();
  };

  const release = (): boolean => {
    if (!current) return false;
    unwatch();
    stopAll(current);
    current = null;
    return true;
  };

  /** The browser's own "Stop sharing" ends the tracks: follow it. */
  const watch = (capture: DisplayCapture): (() => void) => {
    const onVideoEnded = (): void => {
      if (current === capture && release()) notify();
    };
    const onAudioEnded = (): void => {
      if (current !== capture) return;
      current = { ...capture, audio: null };
      notify();
    };
    capture.video.addEventListener("ended", onVideoEnded);
    capture.audio?.addEventListener("ended", onAudioEnded);
    return () => {
      capture.video.removeEventListener("ended", onVideoEnded);
      capture.audio?.removeEventListener("ended", onAudioEnded);
    };
  };

  return {
    get video() {
      return current?.video ?? null;
    },
    get audio() {
      return current?.audio ?? null;
    },
    async start(audio) {
      generation += 1;
      const mine = generation;
      const picked = await env.captureDisplay({ audio });
      if (mine !== generation) {
        stopAll(picked);
        return;
      }
      release();
      current = picked;
      unwatch = watch(picked);
      notify();
    },
    stop() {
      generation += 1;
      if (release()) notify();
    },
    onChange(listener) {
      const registration = { listener };
      listeners = [...listeners, registration];
      return () => {
        listeners = listeners.filter((r) => r !== registration);
      };
    },
  };
}
