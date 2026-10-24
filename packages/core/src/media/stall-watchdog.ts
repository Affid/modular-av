import type { CaptureContext, SignalProbe } from "./env.ts";

/** Digital silence for this long while the microphone hears sound: stalled. */
export const STALL_MS = 1500;
const CHECK_MS = 250;
/** About -60 dBFS: the microphone hears more than its own noise floor. */
const SOUND_PEAK = 0.001;

/** What the effect's state shows as its error. */
export class StalledError extends Error {
  override readonly name = "StalledError";
  constructor() {
    super("The effect stopped sending sound");
  }
}

export interface WatchedEffect {
  readonly id: string;
  readonly output: AudioNode;
}

/**
 * Watches denoise effects for a stalled worklet. A model that stopped
 * running sends exact zeros; one that removes noise sends quiet, but not
 * zero, so only digital silence while the microphone hears sound counts.
 */
export interface StallWatchdog {
  /** The raw microphone in the chain, or null. */
  setSource(source: AudioNode | null): void;
  setEffects(effects: readonly WatchedEffect[]): void;
  dispose(): void;
}

interface Tap {
  readonly node: AudioNode;
  readonly probe: SignalProbe;
}

interface Watched extends Tap {
  /** How long it has sent digital silence while there was sound. */
  readonly silentMs: number;
}

const tap = (
  capture: Pick<CaptureContext, "createProbe">,
  node: AudioNode,
): Tap => {
  const probe = capture.createProbe();
  node.connect(probe.node);
  return { node, probe };
};

const untap = ({ node, probe }: Tap): void => {
  node.disconnect(probe.node);
  probe.dispose();
};

export function createStallWatchdog(
  capture: Pick<CaptureContext, "createProbe" | "running">,
  onStalled: (id: string, error: StalledError) => void,
): StallWatchdog {
  let sourceNode: AudioNode | null = null;
  /** Tapped only while some effect is watched. */
  let source: Tap | null = null;
  let watched: ReadonlyMap<string, Watched> = new Map();
  let timer: ReturnType<typeof setInterval> | undefined;

  const hearsSound = (): boolean =>
    capture.running && source !== null && source.probe.peak() >= SOUND_PEAK;

  const check = (): void => {
    const sound = hearsSound();
    watched = new Map(
      [...watched].map(([id, w]) => [
        id,
        {
          ...w,
          silentMs: sound && w.probe.peak() === 0 ? w.silentMs + CHECK_MS : 0,
        },
      ]),
    );
    for (const [id, w] of watched)
      if (w.silentMs >= STALL_MS) onStalled(id, new StalledError());
  };

  /** Taps the source and runs the timer only while there is work. */
  const sync = (): void => {
    const needed = sourceNode !== null && watched.size > 0;
    if (source && (!needed || source.node !== sourceNode)) {
      untap(source);
      source = null;
    }
    if (needed && !source && sourceNode) source = tap(capture, sourceNode);
    if (needed && timer === undefined) timer = setInterval(check, CHECK_MS);
    if (!needed && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const setEffects = (effects: readonly WatchedEffect[]): void => {
    const keep = (id: string, output: AudioNode): Watched | undefined => {
      const current = watched.get(id);
      return current?.node === output ? current : undefined;
    };
    const next = new Map(
      effects.map(({ id, output }) => [
        id,
        keep(id, output) ?? { ...tap(capture, output), silentMs: 0 },
      ]),
    );
    for (const [id, w] of watched) if (next.get(id) !== w) untap(w);
    watched = next;
    sync();
  };

  return {
    setSource(next) {
      sourceNode = next;
      sync();
    },
    setEffects,
    dispose() {
      sourceNode = null;
      setEffects([]);
    },
  };
}
