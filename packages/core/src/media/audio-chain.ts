import type { AudioStage } from "@modular-av/api";
import type { CaptureContext } from "./env.ts";

/** A running audio effect, as the chain wires it. */
export interface ChainEffect {
  readonly id: string;
  readonly stage: AudioStage;
  readonly input: AudioNode;
  readonly output: AudioNode;
}

/**
 * The microphone chain in the capture context: source → effects by stage →
 * gate → destination. Every change connects the new path before cutting the
 * old one, in one task, so audio neither stops nor skips an effect.
 */
export interface AudioChain {
  /** The raw microphone, or null for none. */
  setSource(track: MediaStreamTrack | null): void;
  /** In the order they run; see `orderByStage`. */
  setEffects(effects: readonly ChainEffect[]): void;
  setGate(gate: AudioNode | null): void;
  dispose(): void;
}

const STAGES: readonly AudioStage[] = ["denoise", "voice", "post"];

export function orderByStage(
  effects: readonly ChainEffect[],
): readonly ChainEffect[] {
  return STAGES.flatMap((stage) => effects.filter((e) => e.stage === stage));
}

type Edge = readonly [AudioNode, AudioNode];

interface Link {
  readonly input: AudioNode;
  readonly output: AudioNode;
}

const same = (a: Edge, b: Edge): boolean => a[0] === b[0] && a[1] === b[1];

export function createAudioChain(capture: CaptureContext): AudioChain {
  let source: AudioNode | null = null;
  let effects: readonly ChainEffect[] = [];
  let gate: AudioNode | null = null;
  let edges: readonly Edge[] = [];

  const wanted = (): readonly Edge[] => {
    if (!source) return [];
    const node = (n: AudioNode): Link => ({ input: n, output: n });
    const links: readonly Link[] = [
      node(source),
      ...effects,
      ...(gate ? [node(gate)] : []),
      node(capture.destination),
    ];
    return links.flatMap((link, i) => {
      const next = links[i + 1];
      return next ? [[link.output, next.input] as const] : [];
    });
  };

  const rewire = (): void => {
    const next = wanted();
    for (const edge of next)
      if (!edges.some((e) => same(e, edge))) edge[0].connect(edge[1]);
    for (const edge of edges)
      if (!next.some((e) => same(e, edge))) edge[0].disconnect(edge[1]);
    edges = next;
  };

  return {
    setSource(track) {
      const previous = source;
      source = track ? capture.createSource(track) : null;
      rewire();
      previous?.disconnect();
    },
    setEffects(next) {
      effects = next;
      rewire();
    },
    setGate(next) {
      gate = next;
      rewire();
    },
    dispose() {
      const previous = source;
      source = null;
      rewire();
      previous?.disconnect();
    },
  };
}
