import type { MediaPermissions } from "@modular-av/api";
import { errorName } from "../errors.ts";
import type { GateConfig, MediaEnv } from "./env.ts";
import type { Microphone } from "./microphone.ts";

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

export interface LocalMediaDeps {
  readonly gate: GateConfig;
  readonly onError: (error: unknown) => void;
}

export interface LocalMedia {
  /** Captures what changed and stops what is no longer wanted. */
  acquire(devices: DeviceChoice): Promise<void>;
  /**
   * The track handed to the service: the capture context's output, the
   * same track while devices and effects change. Its `enabled` is the mute.
   */
  readonly microphone: MediaStreamTrack | null;
  readonly camera: MediaStreamTrack | null;
  readonly errors: CaptureErrors;
  /** False while the voice gate can't run: the microphone goes out ungated. */
  readonly gateRunning: boolean;
  setGate(config: GateConfig): void;
  /** The gate's open and close transitions. */
  onGate(listener: (open: boolean) => void): () => void;
  /** Applied at once and to every track captured later. */
  setOutbound(outbound: MediaPermissions): void;
  release(): void;
  /** Tracks were replaced or removed, or the gate stopped or started. */
  onChange(listener: () => void): () => void;
}

interface Captured {
  readonly device: string;
  readonly raw: MediaStreamTrack;
}

type Listeners<T> = readonly { readonly listener: (value: T) => void }[];

export function createLocalMedia(
  env: MediaEnv,
  deps: LocalMediaDeps,
): LocalMedia {
  let audio: Captured | null = null;
  let video: Captured | null = null;
  let mic: Microphone | null = null;
  let gate = deps.gate;
  let errors: CaptureErrors = { audio: null, video: null };
  let outbound: MediaPermissions = { audio: false, video: false };
  let listeners: Listeners<void> = [];
  let gateListeners: Listeners<boolean> = [];
  let queue: Promise<void> = Promise.resolve();
  /** Bumped by `release()`: captures from before it are stopped, not kept. */
  let epoch = 0;

  const applyOutbound = (): void => {
    mic?.setEnabled(outbound.audio);
    if (video) video.raw.enabled = outbound.video;
  };

  const changed = (): void => {
    for (const { listener } of listeners) listener();
  };

  const load = async (): Promise<Microphone> => {
    const { createMicrophone } = await import("./microphone.ts");
    const created = createMicrophone({
      env,
      gate,
      onChange: changed,
      onReplaced: () => undefined,
      onError: deps.onError,
    });
    created.onGate((open) => {
      for (const { listener } of gateListeners) listener(open);
    });
    created.setEnabled(outbound.audio);
    mic = created;
    return created;
  };
  let loading: Promise<Microphone> | null = null;
  /** Its code loads with the first microphone, outside the entry chunk. */
  const microphone = (): Promise<Microphone> => (loading ??= load());

  const captureAudio = async (device: string): Promise<Captured> => ({
    device,
    raw: await env.captureAudio(device),
  });

  /** Fail closed: a new track starts with the current outbound state. */
  const captureVideo = async (device: string): Promise<Captured> => {
    const raw = await env.captureVideo(device);
    raw.enabled = outbound.video;
    return { device, raw };
  };

  /** The new device joins the chain before the old one stops. */
  const switchAudio = async (
    next: PromiseSettledResult<Captured | null>,
  ): Promise<void> => {
    const previous = audio;
    audio = next.status === "fulfilled" ? next.value : null;
    errors = {
      ...errors,
      audio: next.status === "rejected" ? errorName(next.reason) : null,
    };
    if (audio || mic) await (await microphone()).setInput(audio?.raw ?? null);
    previous?.raw.stop();
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
        if (next.status === "fulfilled") next.value?.raw.stop();
      return;
    }
    if (wantVideo) {
      video?.raw.stop();
      video = nextVideo.status === "fulfilled" ? nextVideo.value : null;
      errors = {
        ...errors,
        video:
          nextVideo.status === "rejected" ? errorName(nextVideo.reason) : null,
      };
    }
    if (wantAudio) await switchAudio(nextAudio);
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
      return audio ? (mic?.output ?? null) : null;
    },
    get camera() {
      return video?.raw ?? null;
    },
    get errors() {
      return errors;
    },
    get gateRunning() {
      return mic?.gateRunning ?? false;
    },
    setGate(next) {
      gate = next;
      mic?.setGate(next);
    },
    onGate(listener) {
      const registration = { listener };
      gateListeners = [...gateListeners, registration];
      return () => {
        gateListeners = gateListeners.filter((r) => r !== registration);
      };
    },
    setOutbound(next) {
      outbound = next;
      applyOutbound();
    },
    release() {
      epoch += 1;
      const had = audio !== null || video !== null;
      audio?.raw.stop();
      video?.raw.stop();
      audio = null;
      video = null;
      mic?.setInput(null).catch(deps.onError);
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
