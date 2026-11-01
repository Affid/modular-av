import type {
  AudioEffect,
  AudioEffectDefinition,
  AudioPlace,
  EffectState,
  MeterReading,
} from "@modular-av/api";
import { AUDIO_PLACES, NOISE_SUPPRESSION_GROUP } from "./audio-places.ts";
import {
  createAudioChain,
  orderByPlace,
  type AudioChain,
  type ChainEffect,
} from "./audio-chain.ts";
import { NO_PLACEMENT, type EffectPlacement } from "./effect-places.ts";
import {
  createEffectRunner,
  type EffectRunner,
  type Started,
} from "./effect-runner.ts";
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
  readonly env: Pick<
    MediaEnv,
    "createCaptureContext" | "createAudioEffectHost"
  >;
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
  /** How long what runs now can still ring out after sound stops. */
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
  /** Moves running effects without restarting them. */
  setPlacement(placement: EffectPlacement): void;
  dispose(): void;
}

interface Parts {
  readonly capture: CaptureContext;
  readonly chain: AudioChain;
  readonly runner: EffectRunner<AudioEffectDefinition>;
  /** Each is checked against what it hears, so a watchdog per place. */
  readonly watchdogs: Readonly<Record<AudioPlace, StallWatchdog>>;
}

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
  let placement = NO_PLACEMENT;
  let running: readonly Started<AudioEffect>[] = [];
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
  /** For after an await, where a plain read looks already narrowed to false. */
  const isDisposed = (): boolean => disposed;
  let levelListeners: readonly {
    readonly listener: (reading: MeterReading) => void;
  }[] = [];
  /** Tells a (new) gate whether anyone wants its levels. */
  const applyLevels = (): void => {
    gate?.setLevels(levelListeners.length > 0);
  };

  const definitionOf = (id: string): AudioEffectDefinition | undefined =>
    definitions.find((d) => d.id === id);
  const silencesNoise = (e: ChainEffect): boolean =>
    definitionOf(e.id)?.silencesNoise === true;
  const placeOf = (definition: AudioEffectDefinition): AudioPlace =>
    placement.places[definition.id] ?? definition.defaultPlace;

  /**
   * Those of `place` that can't stay silent, as the watchdog wants them.
   * Sends are parallel; inserts are in series, so what follows an effect
   * that may send exact zeros may hear them.
   */
  const watched = (
    effects: readonly ChainEffect[],
    place: AudioPlace,
  ): readonly WatchedEffect[] => {
    const here = effects.filter((e) => e.place === place);
    const silencer = here.findIndex(silencesNoise);
    const checked =
      place === "send"
        ? here.filter((e) => !silencesNoise(e))
        : here.slice(0, silencer < 0 ? here.length : silencer);
    return checked.map((e) => ({
      ...e,
      graceMs: (definitionOf(e.id)?.tail ?? 0) * 1000,
    }));
  };

  /** What runs now, where it should be. */
  const place = ({
    chain,
    watchdogs,
  }: Pick<Parts, "chain" | "watchdogs">): void => {
    const effects = orderByPlace(
      running.flatMap(({ id, instance }) => {
        const definition = definitionOf(id);
        return definition
          ? [
              {
                id,
                place: placeOf(definition),
                ...nodesOf(instance),
                ...(definition.latency === undefined
                  ? {}
                  : { latency: definition.latency }),
              },
            ]
          : [];
      }),
      (id) => definitionOf(id)?.exclusiveGroup === NOISE_SUPPRESSION_GROUP,
      placement.order,
    );
    chain.setEffects(effects);
    for (const at of AUDIO_PLACES)
      watchdogs[at].setEffects(watched(effects, at));
  };

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
      "pre-gate": watchdog(),
      "post-gate": watchdog(),
      send: watchdog(),
    };
    watchdogs["post-gate"].setSource(chain.postFeed);
    watchdogs.send.setSource(chain.sendBus);
    runner = createEffectRunner<AudioEffectDefinition, AudioEffect>({
      group: (d) => d.exclusiveGroup ?? null,
      start: (d, context) =>
        d.create({
          ...context,
          audioContext: capture.audioContext,
          host: deps.env.createAudioEffectHost(capture.audioContext, {
            ...(d.tail === undefined ? {} : { tail: d.tail }),
            fail: context.fail,
          }),
        }),
      onRunning(next) {
        running = next;
        place({ chain, watchdogs });
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
    tellGate(false);
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

  const teardown = (old: Parts): void => {
    old.runner.dispose();
    for (const watchdog of Object.values(old.watchdogs)) watchdog.dispose();
    old.chain.dispose();
    gate?.dispose();
    gate = null;
    old.capture.suspend().catch(deps.onError);
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
    if (disposed) {
      teardown(parts);
      return;
    }
    if (!gate) await loadGate(parts);
    if (isDisposed()) return;
    input = track;
    applyEnabled();
    parts.chain.setSource(track);
    parts.watchdogs["pre-gate"].setSource(parts.chain.source);
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
    parts.watchdogs["pre-gate"].setSource(null);
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
      // Mute cuts what is ahead of it.
      const ringing = definitions.filter(
        (d) =>
          placeOf(d) !== "pre-gate" &&
          parts?.runner.status(d.id).status === "running",
      );
      return Math.max(0, ...ringing.map((d) => (d.tail ?? 0) * 1000));
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
    setPlacement(next) {
      if (JSON.stringify(next) === JSON.stringify(placement)) return;
      placement = next;
      if (parts) place(parts);
    },
    dispose() {
      disposed = true;
      input = null;
      if (parts) teardown(parts);
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
