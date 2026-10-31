import type {
  AudioEffect,
  AudioEffectDefinition,
  AudioStage,
  EffectState,
  MeterReading,
} from "@modular-av/api";
import {
  createAudioChain,
  orderByStage,
  type AudioChain,
  type ChainEffect,
} from "./audio-chain.ts";
import { createEffectRunner, type EffectRunner } from "./effect-runner.ts";
import type { VoiceLevels } from "./levels.ts";
import {
  createStallWatchdog,
  type StallWatchdog,
  type WatchedEffect,
} from "./stall-watchdog.ts";
import type {
  CaptureContext,
  GateConfig,
  MediaEnv,
  VoiceGateNode,
} from "./env.ts";

export interface MicrophoneDeps {
  readonly env: Pick<MediaEnv, "createCaptureContext" | "createEffectHost">;
  readonly gate: GateConfig;
  /** The output, the gate or an effect's state changed. */
  readonly onChange: () => void;
  /** Effects replaced by another of their exclusive group. */
  readonly onReplaced: (ids: readonly string[]) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * The microphone's processing: one capture context, created with the first
 * device, whose output track is sent for as long as a device is in. If the
 * gate can't run, audio goes through ungated.
 */
export interface Microphone {
  /** The raw device track, or null; calls apply in order. */
  setInput(track: MediaStreamTrack | null): Promise<void>;
  /** The track to send, null without a device. */
  readonly output: MediaStreamTrack | null;
  /** False while the gate failed to load or broke: nothing is gated. */
  readonly gateRunning: boolean;
  /** The output: disabled until enabled, and always without a device. */
  setEnabled(enabled: boolean): void;
  /** The mute after the gate, closed until opened and without a device. */
  setVoiceOpen(open: boolean): void;
  /** How long what runs now rings after sound stops. */
  readonly tailMs: number;
  setGate(config: GateConfig): void;
  onGate(listener: (open: boolean) => void): () => void;
  /** The gate's level reports, on only while someone listens. */
  onLevel(listener: (reading: MeterReading) => void): () => void;
  setEffects(
    definitions: readonly AudioEffectDefinition[],
    wanted: ReadonlySet<string>,
  ): void;
  effectStatus(id: string): EffectState;
  /** Applied at once, and when the chain is built. */
  setLevels(levels: VoiceLevels): void;
  dispose(): void;
}

interface Parts {
  readonly capture: CaptureContext;
  readonly chain: AudioChain;
  readonly runner: EffectRunner<AudioEffectDefinition>;
  readonly watchdogs: Readonly<Record<WatchedStage, StallWatchdog>>;
}

/** Each is checked against what it hears, so a watchdog per stage. */
type WatchedStage = Exclude<AudioStage, "voice">;
const WATCHED_STAGES: readonly WatchedStage[] = ["denoise", "post", "send"];

const OFF: EffectState = { status: "off", error: null };

export function createMicrophone(deps: MicrophoneDeps): Microphone {
  let parts: Parts | null = null;
  let gate: VoiceGateNode | null = null;
  let input: MediaStreamTrack | null = null;
  let config = deps.gate;
  let enabled = false;
  let voiceOpen = false;
  let definitions: readonly AudioEffectDefinition[] = [];
  let wanted: ReadonlySet<string> = new Set();
  let levels: VoiceLevels = { channel: 1, mix: {} };
  let gateListeners: readonly { readonly listener: (open: boolean) => void }[] =
    [];
  /** What the gate last said: it can't say "closed" once suspended. */
  let gateOpen = false;
  const tellGate = (open: boolean): void => {
    if (open === gateOpen) return;
    gateOpen = open;
    parts?.chain.setSpeaking(open);
    for (const { listener } of gateListeners) listener(open);
  };
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;
  let levelListeners: readonly {
    readonly listener: (reading: MeterReading) => void;
  }[] = [];
  /** Tells a (new) gate whether anyone wants its levels. */
  const applyLevels = (): void => {
    gate?.setLevels(levelListeners.length > 0);
  };

  /** Those of `stage` that can't stay silent, as the watchdog wants them. */
  const watched = (
    effects: readonly ChainEffect[],
    stage: WatchedStage,
  ): readonly WatchedEffect[] =>
    effects.flatMap((e) => {
      const definition = definitions.find((d) => d.id === e.id);
      return e.stage === stage && definition?.silencesNoise !== true
        ? [{ ...e, graceMs: (definition?.tail ?? 0) * 1000 }]
        : [];
    });

  const createParts = (capture: CaptureContext): Parts => {
    const chain = createAudioChain(capture);
    // Created before the runner, whose effects it watches.
    let runner: EffectRunner<AudioEffectDefinition> | null = null;
    const watchdog = (): StallWatchdog =>
      createStallWatchdog(
        capture,
        (id, error) => {
          runner?.fail(id, error);
        },
        deps.onError,
      );
    const watchdogs = {
      denoise: watchdog(),
      post: watchdog(),
      send: watchdog(),
    };
    watchdogs.post.setSource(chain.postFeed);
    watchdogs.send.setSource(chain.sendBus);
    runner = createEffectRunner<AudioEffectDefinition, AudioEffect>({
      group: (d) => d.exclusiveGroup ?? null,
      start: (d, context) =>
        d.create({
          ...context,
          audioContext: capture.audioContext,
          host: deps.env.createEffectHost(capture.audioContext, {
            ...(d.tail === undefined ? {} : { tail: d.tail }),
            fail: context.fail,
          }),
        }),
      onRunning(running) {
        const effects = orderByStage(
          running.flatMap(({ id, instance }) => {
            const definition = definitions.find((d) => d.id === id);
            return definition
              ? [
                  {
                    id,
                    stage: definition.stage,
                    ...nodesOf(instance),
                    ...(definition.latency === undefined
                      ? {}
                      : { latency: definition.latency }),
                  },
                ]
              : [];
          }),
        );
        chain.setEffects(effects);
        for (const stage of WATCHED_STAGES)
          watchdogs[stage].setEffects(watched(effects, stage));
      },
      retire: (id) => chain.fade(id),
      onStatus: deps.onChange,
      onReplaced: deps.onReplaced,
      onError: deps.onError,
    });
    return { capture, chain, runner, watchdogs };
  };

  const dropGate = (broken: VoiceGateNode): void => {
    if (gate !== broken) return;
    gate = null;
    parts?.chain.setGate(null);
    broken.dispose();
    deps.onChange();
  };

  const loadGate = async ({ capture, chain }: Parts): Promise<void> => {
    try {
      const requested = config;
      const loaded = await capture.createGate(requested);
      if (disposed) {
        loaded.dispose();
        return;
      }
      gate = loaded;
      // Changed while the worklet loaded.
      if (config !== requested) loaded.configure(config);
      loaded.onTransition(tellGate);
      loaded.onLevel(({ db, threshold }) => {
        const reading = { db, threshold, open: gateOpen };
        for (const { listener } of levelListeners)
          try {
            listener(reading);
          } catch (error: unknown) {
            deps.onError(error);
          }
      });
      applyLevels();
      loaded.onError((error) => {
        deps.onError(error);
        dropGate(loaded);
      });
      chain.setGate(loaded.node);
    } catch (error: unknown) {
      deps.onError(error);
    }
  };

  /** Fail closed: no device, no audio, whatever was enabled before. */
  const applyEnabled = (): void => {
    if (!parts) return;
    parts.chain.setOpen(voiceOpen && input !== null);
    parts.capture.output.enabled = enabled && input !== null;
  };

  const applyMix = (): void => {
    parts?.chain.setChannelLevel(levels.channel);
    for (const [id, mix] of Object.entries(levels.mix))
      parts?.chain.setMix(id, mix);
  };

  const applyEffects = (): void => {
    parts?.runner.update(input ? definitions : [], wanted);
  };

  const connect = async (track: MediaStreamTrack): Promise<void> => {
    if (!parts) {
      parts = createParts(await deps.env.createCaptureContext());
      applyMix();
    }
    if (disposed) return;
    if (!gate) await loadGate(parts);
    input = track;
    applyEnabled();
    parts.chain.setSource(track);
    parts.watchdogs.denoise.setSource(parts.chain.source);
    applyEffects();
    // Not awaited: under an autoplay policy, resuming waits for a gesture.
    parts.capture.resume().catch(deps.onError);
  };

  const disconnect = (): void => {
    input = null;
    tellGate(false);
    if (!parts) return;
    applyEnabled();
    parts.chain.setSource(null);
    parts.watchdogs.denoise.setSource(null);
    applyEffects();
    parts.capture.suspend().catch(deps.onError);
  };

  return {
    setInput(track) {
      const run = queue.then(async () => {
        if (disposed) return;
        if (track) await connect(track);
        else disconnect();
        deps.onChange();
      });
      queue = run.catch(() => undefined);
      return run;
    },
    get output() {
      return input && parts ? parts.capture.output : null;
    },
    get gateRunning() {
      return gate !== null;
    },
    setEnabled(next) {
      enabled = next;
      applyEnabled();
    },
    setVoiceOpen(next) {
      voiceOpen = next;
      applyEnabled();
    },
    get tailMs() {
      const running = definitions.filter(
        (d) => parts?.runner.status(d.id).status === "running",
      );
      return Math.max(0, ...running.map((d) => (d.tail ?? 0) * 1000));
    },
    setGate(next) {
      if (sameGate(config, next)) return;
      config = next;
      gate?.configure(next);
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
      applyLevels();
      return () => {
        levelListeners = levelListeners.filter((r) => r !== registration);
        applyLevels();
      };
    },
    setEffects(nextDefinitions, nextWanted) {
      definitions = nextDefinitions;
      wanted = nextWanted;
      applyEffects();
    },
    effectStatus: (id) => parts?.runner.status(id) ?? OFF,
    setLevels(next) {
      levels = next;
      applyMix();
    },
    dispose() {
      disposed = true;
      input = null;
      if (!parts) return;
      parts.runner.dispose();
      for (const watchdog of Object.values(parts.watchdogs)) watchdog.dispose();
      parts.chain.dispose();
      gate?.dispose();
      gate = null;
      parts.capture.suspend().catch(deps.onError);
    },
  };
}

const sameGate = (a: GateConfig, b: GateConfig): boolean =>
  a.mode === b.mode && a.auto === b.auto && a.threshold === b.threshold;

const nodesOf = (
  effect: AudioEffect,
): { readonly input: AudioNode; readonly output: AudioNode } => ({
  input: effect.input,
  output: effect.output,
});
