import type {
  AudioEffect,
  AudioEffectDefinition,
  EffectState,
  MeterReading,
} from "@modular-av/api";
import {
  createAudioChain,
  orderByStage,
  type AudioChain,
} from "./audio-chain.ts";
import { createEffectRunner, type EffectRunner } from "./effect-runner.ts";
import type {
  CaptureContext,
  GateConfig,
  MediaEnv,
  VoiceGateNode,
} from "./env.ts";

export interface MicrophoneDeps {
  readonly env: Pick<MediaEnv, "createCaptureContext">;
  readonly gate: GateConfig;
  /** The output, the gate or an effect's state changed. */
  readonly onChange: () => void;
  /** Effects replaced by another of their exclusive group. */
  readonly onReplaced: (ids: readonly string[]) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * The microphone's processing: one capture context, created with the first
 * device, whose output track is sent for as long as a device is in. The
 * gate always runs last; if it can't, audio goes through ungated.
 */
export interface Microphone {
  /** The raw device track, or null; calls apply in order. */
  setInput(track: MediaStreamTrack | null): Promise<void>;
  /** The track to send, null without a device. */
  readonly output: MediaStreamTrack | null;
  /** False while the gate failed to load or broke: nothing is gated. */
  readonly gateRunning: boolean;
  /** The mute: disabled until enabled, and always without a device. */
  setEnabled(enabled: boolean): void;
  setGate(config: GateConfig): void;
  onGate(listener: (open: boolean) => void): () => void;
  /** The gate's level reports, on only while someone listens. */
  onLevel(listener: (reading: MeterReading) => void): () => void;
  setEffects(
    definitions: readonly AudioEffectDefinition[],
    wanted: ReadonlySet<string>,
  ): void;
  effectStatus(id: string): EffectState;
  dispose(): void;
}

interface Parts {
  readonly capture: CaptureContext;
  readonly chain: AudioChain;
  readonly runner: EffectRunner<AudioEffectDefinition>;
}

const OFF: EffectState = { status: "off", error: null };

export function createMicrophone(deps: MicrophoneDeps): Microphone {
  let parts: Parts | null = null;
  let gate: VoiceGateNode | null = null;
  let input: MediaStreamTrack | null = null;
  let config = deps.gate;
  let enabled = false;
  let definitions: readonly AudioEffectDefinition[] = [];
  let wanted: ReadonlySet<string> = new Set();
  let gateListeners: readonly { readonly listener: (open: boolean) => void }[] =
    [];
  /** What the gate last said: it can't say "closed" once suspended. */
  let gateOpen = false;
  const tellGate = (open: boolean): void => {
    if (open === gateOpen) return;
    gateOpen = open;
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

  const createParts = (capture: CaptureContext): Parts => {
    const chain = createAudioChain(capture);
    const runner = createEffectRunner<AudioEffectDefinition, AudioEffect>({
      group: (d) => d.exclusiveGroup ?? null,
      start: (d, context) =>
        d.create({ ...context, audioContext: capture.audioContext }),
      onRunning(running) {
        chain.setEffects(
          orderByStage(
            running.flatMap(({ id, instance }) => {
              const definition = definitions.find((d) => d.id === id);
              return definition
                ? [{ id, stage: definition.stage, ...nodesOf(instance) }]
                : [];
            }),
          ),
        );
      },
      onStatus: deps.onChange,
      onReplaced: deps.onReplaced,
      onError: deps.onError,
    });
    return { capture, chain, runner };
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
    if (parts) parts.capture.output.enabled = enabled && input !== null;
  };

  const applyEffects = (): void => {
    parts?.runner.update(input ? definitions : [], wanted);
  };

  const connect = async (track: MediaStreamTrack): Promise<void> => {
    parts ??= createParts(await deps.env.createCaptureContext());
    if (disposed) return;
    if (!gate) await loadGate(parts);
    input = track;
    applyEnabled();
    parts.chain.setSource(track);
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
    dispose() {
      disposed = true;
      input = null;
      if (!parts) return;
      parts.runner.dispose();
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
