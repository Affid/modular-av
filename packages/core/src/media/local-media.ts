import type {
  AudioEffectDefinition,
  CameraHold,
  EffectDefinition,
  EffectState,
  MediaPermissions,
  VideoEffectDefinition,
} from "@modular-av/api";
import { errorName } from "../errors.ts";
import {
  type Captured,
  captureDevice,
  captureRaw,
  type DeviceKindOf,
} from "./device-capture.ts";
import type { GateConfig, MediaEnv } from "./env.ts";
import { createLocalVideo } from "./local-video.ts";
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
  /** Effects stopped because another of their exclusive group runs now. */
  readonly onReplaced: (ids: readonly string[]) => void;
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
  /** Fail closed: null while a wanted video effect isn't running. */
  readonly camera: MediaStreamTrack | null;
  readonly cameraHold: CameraHold | null;
  readonly errors: CaptureErrors;
  /** False while the voice gate can't run: the microphone goes out ungated. */
  readonly gateRunning: boolean;
  setGate(config: GateConfig): void;
  /** The gate's open and close transitions. */
  onGate(listener: (open: boolean) => void): () => void;
  /** The effects that may run, and the ones the player wants on. */
  setEffects(
    definitions: readonly EffectDefinition[],
    wanted: ReadonlySet<string>,
  ): void;
  /** Null for an effect that never started here. */
  effectStatus(id: string): EffectState | null;
  /** Applied at once and to every track captured later. */
  setOutbound(outbound: MediaPermissions): void;
  release(): void;
  /** Tracks were replaced or removed, or the gate stopped or started. */
  onChange(listener: () => void): () => void;
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
  let audioEffects: readonly AudioEffectDefinition[] = [];
  let wantedEffects: ReadonlySet<string> = new Set();
  let errors: CaptureErrors = { audio: null, video: null };
  let outbound: MediaPermissions = { audio: false, video: false };
  let listeners: Listeners<void> = [];
  let gateListeners: Listeners<boolean> = [];
  let queue: Promise<void> = Promise.resolve();
  /** Bumped by `release()`: captures from before it are stopped, not kept. */
  let epoch = 0;

  const changed = (): void => {
    for (const { listener } of listeners) listener();
  };
  const camera = createLocalVideo({
    env,
    onChange: changed,
    onReplaced: deps.onReplaced,
    onError: deps.onError,
  });

  const applyOutbound = (): void => {
    mic?.setEnabled(outbound.audio);
    camera.setEnabled(outbound.video);
  };

  const load = async (): Promise<Microphone> => {
    const { createMicrophone } = await import("./microphone.ts");
    const created = createMicrophone({
      env,
      gate,
      onChange: changed,
      onReplaced: deps.onReplaced,
      onError: deps.onError,
    });
    created.setEffects(audioEffects, wantedEffects);
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

  const current = (kind: DeviceKindOf): Captured | null =>
    kind === "audio" ? audio : video;

  const feed = async (
    kind: DeviceKindOf,
    raw: MediaStreamTrack | null,
  ): Promise<void> => {
    if (kind === "video") await camera.setInput(raw);
    else if (raw || mic) await (await microphone()).setInput(raw);
  };

  /** The new device joins the chain before the old one stops. */
  const switchTo = async (
    kind: DeviceKindOf,
    next: PromiseSettledResult<Captured | null>,
  ): Promise<void> => {
    const previous = current(kind);
    const captured = next.status === "fulfilled" ? next.value : null;
    // Fail closed: a new camera starts with the current outbound state.
    if (kind === "video" && captured) captured.raw.enabled = outbound.video;
    if (kind === "audio") audio = captured;
    else video = captured;
    errors = {
      ...errors,
      [kind]: next.status === "rejected" ? errorName(next.reason) : null,
    };
    if (captured) watchEnd(kind, captured);
    await feed(kind, captured?.raw ?? null);
    previous?.raw.stop();
  };

  const enqueue = (run: () => Promise<void>): Promise<void> => {
    const next = queue.then(run);
    // A failure reaches this caller only, never the next acquisition.
    queue = next.catch(() => undefined);
    return next;
  };

  /** Captures, then switches, unless `release()` came in between. */
  const replace = async (
    kinds: readonly DeviceKindOf[],
    capture: (kind: DeviceKindOf) => Promise<Captured | null>,
  ): Promise<void> => {
    const started = epoch;
    const results = await Promise.allSettled(kinds.map(capture));
    if (started !== epoch) {
      for (const next of results)
        if (next.status === "fulfilled") next.value?.raw.stop();
      return;
    }
    for (const [i, next] of results.entries()) {
      const kind = kinds[i];
      if (kind) await switchTo(kind, next);
    }
    applyOutbound();
    changed();
  };

  /** Unplugged or revoked: the same choice again, or the default. */
  function watchEnd(kind: DeviceKindOf, captured: Captured): void {
    captured.raw.addEventListener(
      "ended",
      () => {
        enqueue(async () => {
          if (current(kind) !== captured) return;
          await replace([kind], () =>
            captureDevice(env, kind, captured.device),
          );
        }).catch(deps.onError);
      },
      { once: true },
    );
  }

  /** A device came back: leave the default for the player's choice. */
  const returnFromFallbacks = (): Promise<void> =>
    enqueue(async () => {
      for (const kind of ["audio", "video"] as const) {
        const fallen = current(kind);
        if (!fallen?.fallback) continue;
        let raw: MediaStreamTrack;
        try {
          raw = await captureRaw(env, kind, fallen.device);
        } catch {
          continue;
        }
        await replace([kind], () =>
          Promise.resolve({ device: fallen.device, raw, fallback: false }),
        );
      }
    });
  env.onDeviceChange(() => {
    returnFromFallbacks().catch(deps.onError);
  });

  const update = async (devices: DeviceChoice): Promise<void> => {
    const kinds = (["audio", "video"] as const).filter(
      (kind) => devices[kind] !== (current(kind)?.device ?? null),
    );
    if (kinds.length === 0) return;
    await replace(kinds, (kind) => {
      const device = devices[kind];
      return device === null
        ? Promise.resolve(null)
        : captureDevice(env, kind, device);
    });
  };

  return {
    acquire: (devices) => enqueue(() => update(devices)),
    get microphone() {
      return audio ? (mic?.output ?? null) : null;
    },
    get camera() {
      return video ? camera.output : null;
    },
    get cameraHold() {
      return video ? camera.hold : null;
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
    setEffects(definitions, wanted) {
      audioEffects = definitions.filter(
        (d): d is AudioEffectDefinition => d.kind === "audio",
      );
      wantedEffects = wanted;
      mic?.setEffects(audioEffects, wanted);
      camera.setEffects(
        definitions.filter(
          (d): d is VideoEffectDefinition => d.kind === "video",
        ),
        wanted,
      );
    },
    effectStatus(id) {
      const status = audioEffects.some((d) => d.id === id)
        ? mic?.effectStatus(id)
        : camera.effectStatus(id);
      return status ?? null;
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
      camera.setInput(null).catch(deps.onError);
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
