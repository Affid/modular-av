import type { MediaPermissions } from "@modular-av/api";
import type { MediaEnv } from "./env.ts";

/** A device id, or null to capture nothing of that kind. */
export interface DeviceChoice {
  readonly audio: string | null;
  readonly video: string | null;
}

/** Why a capture failed: the DOMException name, e.g. "NotAllowedError". */
export interface CaptureErrors {
  readonly audio: string | null;
  readonly video: string | null;
}

export interface LocalMedia {
  /** Captures what changed and stops what is no longer wanted. */
  acquire(devices: DeviceChoice): Promise<void>;
  /** The track handed to the service; its `enabled` is the mute. */
  readonly microphone: MediaStreamTrack | null;
  readonly camera: MediaStreamTrack | null;
  /** The raw microphone, never muted, for level detection. */
  readonly levelsStream: MediaStream | null;
  readonly errors: CaptureErrors;
  /** Applied at once and to every track captured later. */
  setOutbound(outbound: MediaPermissions): void;
  release(): void;
  /** Tracks were replaced or removed. */
  onChange(listener: () => void): () => void;
}

interface Captured {
  readonly device: string;
  readonly raw: MediaStreamTrack;
  readonly sent: MediaStreamTrack;
}

const errorName = (error: unknown): string =>
  error instanceof DOMException || error instanceof Error
    ? error.name
    : "Error";

const stop = (captured: Captured | null): void => {
  if (!captured) return;
  captured.sent.stop();
  if (captured.raw !== captured.sent) captured.raw.stop();
};

export function createLocalMedia(env: MediaEnv): LocalMedia {
  let audio: Captured | null = null;
  let video: Captured | null = null;
  let levels: MediaStream | null = null;
  let errors: CaptureErrors = { audio: null, video: null };
  let outbound: MediaPermissions = { audio: false, video: false };
  let listeners: readonly { readonly listener: () => void }[] = [];
  let queue: Promise<void> = Promise.resolve();
  /** Bumped by `release()`: captures from before it are stopped, not kept. */
  let epoch = 0;

  const applyOutbound = (): void => {
    if (audio) audio.sent.enabled = outbound.audio;
    if (video) video.sent.enabled = outbound.video;
  };

  const changed = (): void => {
    for (const { listener } of listeners) listener();
  };

  /** Fail closed: a new track starts with the current outbound state. */
  const captureAudio = async (device: string): Promise<Captured> => {
    const raw = await env.captureAudio(device);
    const sent = raw.clone();
    sent.enabled = outbound.audio;
    return { device, raw, sent };
  };

  const captureVideo = async (device: string): Promise<Captured> => {
    const raw = await env.captureVideo(device);
    raw.enabled = outbound.video;
    return { device, raw, sent: raw };
  };

  const update = async (devices: DeviceChoice): Promise<void> => {
    const wantAudio = devices.audio !== (audio?.device ?? null);
    const wantVideo = devices.video !== (video?.device ?? null);
    if (!wantAudio && !wantVideo) return;
    const started = epoch;
    const [nextAudio, nextVideo] = await Promise.allSettled([
      wantAudio && devices.audio !== null ? captureAudio(devices.audio) : null,
      wantVideo && devices.video !== null ? captureVideo(devices.video) : null,
    ]);
    if (started !== epoch) {
      for (const next of [nextAudio, nextVideo])
        if (next.status === "fulfilled") stop(next.value);
      return;
    }
    if (wantAudio) {
      stop(audio);
      audio = nextAudio.status === "fulfilled" ? nextAudio.value : null;
      levels = audio ? env.createStream([audio.raw]) : null;
      errors = {
        ...errors,
        audio:
          nextAudio.status === "rejected" ? errorName(nextAudio.reason) : null,
      };
    }
    if (wantVideo) {
      stop(video);
      video = nextVideo.status === "fulfilled" ? nextVideo.value : null;
      errors = {
        ...errors,
        video:
          nextVideo.status === "rejected" ? errorName(nextVideo.reason) : null,
      };
    }
    applyOutbound();
    changed();
  };

  return {
    acquire(devices) {
      const run = queue.then(() => update(devices));
      // A failure reaches this caller only, never the next acquisition.
      queue = run.catch(() => undefined);
      return run;
    },
    get microphone() {
      return audio?.sent ?? null;
    },
    get camera() {
      return video?.sent ?? null;
    },
    get levelsStream() {
      return levels;
    },
    get errors() {
      return errors;
    },
    setOutbound(next) {
      outbound = next;
      applyOutbound();
    },
    release() {
      epoch += 1;
      const had = audio !== null || video !== null;
      stop(audio);
      stop(video);
      audio = null;
      video = null;
      levels = null;
      if (had) changed();
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
