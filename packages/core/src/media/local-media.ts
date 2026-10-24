import type {
  AudioEffectDefinition,
  CameraHold,
  EffectDefinition,
  EffectState,
  MediaPermissions,
  MeterReading,
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

/** Effects in this group replace the browser's own noise suppression. */
export const NOISE_SUPPRESSION_GROUP = "noise-suppression";

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
  /** The microphone's level, also once it is first captured. */
  onLevel(listener: (reading: MeterReading) => void): () => void;
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
  let levelListeners: Listeners<MeterReading> = [];
  /** The microphone's level reports, on while anyone listens. */
  let offLevels: (() => void) | null = null;
  const syncLevels = (): void => {
    const wanted = levelListeners.length > 0;
    if (wanted && mic && !offLevels)
      offLevels = mic.onLevel((reading) => {
        for (const { listener } of levelListeners) listener(reading);
      });
    if (!wanted && offLevels) {
      offLevels();
      offLevels = null;
    }
  };
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
      onChange: () => {
        changed();
        syncNoiseSuppression();
      },
      onReplaced: deps.onReplaced,
      onError: deps.onError,
    });
    created.setEffects(audioEffects, wantedEffects);
    created.onGate((open) => {
      for (const { listener } of gateListeners) listener(open);
    });
    created.setEnabled(outbound.audio);
    mic = created;
    syncLevels();
    return created;
  };
  let loading: Promise<Microphone> | null = null;
  /** Its code loads with the first microphone, outside the entry chunk. */
  const microphone = (): Promise<Microphone> => (loading ??= load());

  const current = (kind: DeviceKindOf): Captured | null =>
    kind === "audio" ? audio : video;

  /** Off while a noise model runs: the two fight each other. */
  const browserNoiseSuppression = (): boolean =>
    !audioEffects.some(
      (d) =>
        d.exclusiveGroup === NOISE_SUPPRESSION_GROUP &&
        mic?.effectStatus(d.id).status === "running",
    );

  /** Captures the same microphone again once that changed. */
  const syncNoiseSuppression = (): void => {
    if (!audio || audio.noiseSuppression === browserNoiseSuppression()) return;
    enqueue(async () => {
      const captured = audio;
      const wanted = browserNoiseSuppression();
      if (!captured || captured.noiseSuppression === wanted) return;
      await replace(["audio"], () =>
        captureDevice(env, "audio", captured.device, wanted),
      );
    }).catch(deps.onError);
  };

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
    try {
      await feed(kind, captured?.raw ?? null);
    } catch (error: unknown) {
      // Not wired: free the device and say why, rather than keep it open.
      captured?.raw.stop();
      if (kind === "audio") audio = null;
      else video = null;
      errors = { ...errors, [kind]: errorName(error) };
      deps.onError(error);
    } finally {
      previous?.raw.stop();
    }
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
            captureDevice(
              env,
              kind,
              captured.device,
              captured.noiseSuppression,
            ),
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
        const started = epoch;
        let raw: MediaStreamTrack;
        try {
          raw = await captureRaw(
            env,
            kind,
            fallen.device,
            fallen.noiseSuppression,
          );
        } catch {
          continue;
        }
        if (started !== epoch) {
          raw.stop();
          continue;
        }
        await replace([kind], () =>
          Promise.resolve({ ...fallen, raw, fallback: false }),
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
        : captureDevice(env, kind, device, browserNoiseSuppression());
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
    onLevel(listener) {
      const registration = { listener };
      levelListeners = [...levelListeners, registration];
      syncLevels();
      return () => {
        levelListeners = levelListeners.filter((r) => r !== registration);
        syncLevels();
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
