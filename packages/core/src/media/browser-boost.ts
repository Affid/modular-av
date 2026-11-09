/**
 * Plays a remote microphone louder than an element can (its `volume` stops
 * at 1): through Web Audio, then a limiter so a boosted shout can't clip.
 * Loaded with the first volume above 1; one context for the page.
 */

/** What an output was told, as `createElementOutput` keeps it. */
export interface OutputState {
  readonly track: MediaStreamTrack | null;
  readonly volume: number;
  readonly muted: boolean;
  readonly sinkId: string;
}

export interface Booster {
  /** Plays `state` boosted if it should and can; true while it does. */
  sync(state: OutputState): boolean;
  dispose(): void;
}

export interface BoosterTarget {
  readonly context: AudioContext;
  readonly destination: AudioNode;
}

/** A hard knee just under full scale: a boost raises quiet speech, not peaks. */
const LIMITER = {
  threshold: -3,
  knee: 0,
  ratio: 20,
  attack: 0.002,
  release: 0.1,
} as const;

let shared: AudioContext | null = null;
let sharedSink = "default";

function pageTarget(): BoosterTarget {
  shared ??= new AudioContext();
  return { context: shared, destination: shared.destination };
}

function createLimiter(context: BaseAudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  return limiter;
}

/** Chrome 110 and later; not yet in TypeScript's DOM types. */
interface SinkSelectable {
  setSinkId(sinkId: string): Promise<void>;
}

const canSelectSink = (
  context: AudioContext,
): context is AudioContext & SinkSelectable => "setSinkId" in context;

/** Older Safari and Firefox can't send a context to another device. */
function followSink(context: AudioContext, sinkId: string): void {
  if (context !== shared || sinkId === sharedSink) return;
  if (!canSelectSink(context)) return;
  sharedSink = sinkId;
  const id = sinkId === "default" ? "" : sinkId;
  context.setSinkId(id).catch(() => undefined);
}

/**
 * A context made without a click may wait for one: until it runs, the
 * element plays at full volume instead (`sync` returns false).
 */
function whenRunning(context: AudioContext, onChange: () => void): () => void {
  const resume = (): void => {
    if (context.state === "suspended") context.resume().catch(() => undefined);
  };
  context.addEventListener("statechange", onChange);
  document.addEventListener("pointerdown", resume, { once: true });
  resume();
  return () => {
    context.removeEventListener("statechange", onChange);
    document.removeEventListener("pointerdown", resume);
  };
}

export function createBooster(
  onChange: () => void,
  target: BoosterTarget = pageTarget(),
): Booster {
  const { context } = target;
  const gain = context.createGain();
  const limiter = createLimiter(context);
  gain.connect(limiter).connect(target.destination);
  const unwatch = whenRunning(context, onChange);
  let playing: MediaStreamTrack | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  const play = (track: MediaStreamTrack | null): void => {
    if (track === playing) return;
    source?.disconnect();
    source = track
      ? context.createMediaStreamSource(new MediaStream([track]))
      : null;
    source?.connect(gain);
    playing = track;
  };

  return {
    sync(state) {
      const boosted = state.volume > 1 && context.state === "running";
      play(boosted ? state.track : null);
      gain.gain.value = state.muted ? 0 : state.volume;
      followSink(context, state.sinkId);
      return playing !== null;
    },
    dispose() {
      unwatch();
      play(null);
      gain.disconnect();
      limiter.disconnect();
    },
  };
}
