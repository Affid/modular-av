import type { AudioStage } from "@modular-av/api";
import { AUDIO_STAGES } from "./audio-stages.ts";
import {
  GATE_FEED_OUTPUT,
  GATE_SEND_OUTPUT,
  type CaptureContext,
  type LevelNode,
} from "./env.ts";

/** A running audio effect, as the chain wires it. */
export interface ChainEffect {
  readonly id: string;
  readonly stage: AudioStage;
  readonly input: AudioNode;
  readonly output: AudioNode;
}

/**
 * The microphone chain in the capture context (docs/voice-routing.md):
 * source → denoise, voice → gate → mute → post feed → post → Channel level →
 * destination, and after `post` a copy → Send on/off → one FX channel per
 * `send` effect → its Return level → destination. Every change connects the
 * new path before cutting the old one, in one task, so audio neither stops
 * nor skips an effect.
 */
export interface AudioChain {
  /** The raw microphone, or null for none. */
  setSource(track: MediaStreamTrack | null): void;
  /** The raw microphone's node in the chain. */
  readonly source: AudioNode | null;
  /** In the order they run; see `orderByStage`. */
  setEffects(effects: readonly ChainEffect[]): void;
  setGate(gate: AudioNode | null): void;
  /** Whether the voice may go on past the gate; closed until told. */
  setOpen(open: boolean): void;
  /** The gate's message, for browsers where a level can't follow it. */
  setSpeaking(speaking: boolean): void;
  /** The dry amount, 0 to 1. */
  setChannelLevel(level: number): void;
  /** A `send` effect's wet amount, 0 to 1, also before it runs. */
  setReturnLevel(id: string, level: number): void;
  /**
   * Fades a `send` effect's Return out, keeping its output connected through
   * the `setEffects` that follows; resolves once it is cut. Null for an
   * effect with nothing to fade.
   */
  fade(id: string): Promise<void> | null;
  dispose(): void;
}

const PRE_GATE: readonly AudioStage[] = ["denoise", "voice"];

/** Short enough to feel at once, long enough not to click. */
const LEVEL_RAMP_MS = 20;
const FADE_MS = 50;
/** As the gate's own ramps, for browsers where a level can't follow it. */
const SEND_OPEN_MS = 5;
const SEND_CLOSE_MS = 50;

export function orderByStage(
  effects: readonly ChainEffect[],
): readonly ChainEffect[] {
  return AUDIO_STAGES.flatMap((stage) =>
    effects.filter((e) => e.stage === stage),
  );
}

type Edge = readonly [AudioNode, AudioNode];

interface Link {
  readonly input: AudioNode;
  readonly output: AudioNode;
}

/** A `send` effect on its way out. */
interface Fading {
  readonly id: string;
  readonly output: AudioNode;
  readonly back: LevelNode;
  finish(): void;
}

const same = (a: Edge, b: Edge): boolean => a[0] === b[0] && a[1] === b[1];

export function createAudioChain(capture: CaptureContext): AudioChain {
  let source: AudioNode | null = null;
  let effects: readonly ChainEffect[] = [];
  let gate: AudioNode | null = null;
  let edges: readonly Edge[] = [];
  let speaking = false;
  let channelLevel = 1;
  let returnLevels: ReadonlyMap<string, number> = new Map();
  let returns: ReadonlyMap<string, LevelNode> = new Map();
  let fading: readonly Fading[] = [];
  const mute = capture.createLevel("mute", 0);
  const feed = capture.createLevel("post feed", 1);
  const channel = capture.createLevel("channel", 1);
  const send = capture.createLevel("send", 1);

  const inStages = (stages: readonly AudioStage[]): readonly ChainEffect[] =>
    effects.filter((e) => stages.includes(e.stage));
  const sends = (): readonly ChainEffect[] => inStages(["send"]);

  const mainPath = (from: AudioNode): readonly Link[] => {
    const node = (n: AudioNode): Link => ({ input: n, output: n });
    return [
      node(from),
      ...inStages(PRE_GATE),
      ...(gate ? [node(gate)] : []),
      node(mute.node),
      node(feed.node),
      ...inStages(["post"]),
      node(channel.node),
      node(capture.destination),
    ];
  };

  const sendEdges = (tap: AudioNode): readonly Edge[] => {
    const fx = sends().flatMap((e) => {
      const back = returns.get(e.id);
      return back
        ? [
            [send.node, e.input] as const,
            [e.output, back.node] as const,
            [back.node, capture.destination] as const,
          ]
        : [];
    });
    return fx.length > 0 ? [[tap, send.node], ...fx] : [];
  };

  const wanted = (): readonly Edge[] => {
    if (!source) return [];
    const links = mainPath(source);
    const main = links.flatMap((link, i) => {
      const next = links[i + 1];
      return next ? [[link.output, next.input] as const] : [];
    });
    // What Channel level gets: the last link ahead of it.
    const tap = links[links.length - 3]?.output ?? source;
    const leaving = fading.flatMap((f) => [
      [f.output, f.back.node] as const,
      [f.back.node, capture.destination] as const,
    ]);
    return [...main, ...sendEdges(tap), ...leaving];
  };

  const rewire = (): void => {
    const next = wanted();
    for (const edge of next)
      if (!edges.some((e) => same(e, edge))) edge[0].connect(edge[1]);
    for (const edge of edges)
      if (!next.some((e) => same(e, edge))) edge[0].disconnect(edge[1]);
    edges = next;
  };

  const levelOf = (id: string): number => returnLevels.get(id) ?? 1;

  /** Without a live send, only the dry path can carry the voice. */
  const applyChannel = (): void => {
    const carried = sends().some((e) => levelOf(e.id) > 0);
    channel.set(carried ? channelLevel : 1, LEVEL_RAMP_MS);
  };

  const addReturns = (): void => {
    returns = new Map(
      sends().map(({ id }) => [
        id,
        returns.get(id) ?? capture.createLevel(`return:${id}`, levelOf(id)),
      ]),
    );
  };

  const applySend = (): void => {
    if (capture.canFollow) {
      feed.follow(gate, GATE_FEED_OUTPUT);
      send.follow(gate, GATE_SEND_OUTPUT);
      return;
    }
    const open = gate === null || speaking;
    send.set(open ? 1 : 0, open ? SEND_OPEN_MS : SEND_CLOSE_MS);
  };
  applySend();

  return {
    get source() {
      return source;
    },
    setSource(track) {
      const previous = source;
      source = track ? capture.createSource(track) : null;
      rewire();
      previous?.disconnect();
    },
    setEffects(next) {
      effects = next;
      const before = returns;
      addReturns();
      rewire();
      for (const [id, back] of before) if (!returns.has(id)) back.dispose();
      applyChannel();
    },
    setGate(next) {
      gate = next;
      rewire();
      applySend();
    },
    setOpen(open) {
      mute.set(open ? 1 : 0);
    },
    setSpeaking(next) {
      speaking = next;
      if (!capture.canFollow) applySend();
    },
    setChannelLevel(level) {
      channelLevel = level;
      applyChannel();
    },
    setReturnLevel(id, level) {
      returnLevels = new Map(returnLevels).set(id, level);
      returns.get(id)?.set(level, LEVEL_RAMP_MS);
      applyChannel();
    },
    fade(id) {
      const effect = sends().find((e) => e.id === id);
      const back = returns.get(id);
      if (!effect || !back) return null;
      returns = new Map([...returns].filter(([key]) => key !== id));
      back.set(0, FADE_MS);
      return new Promise((resolve) => {
        const finish = (): void => {
          clearTimeout(timer);
          fading = fading.filter((f) => f.id !== id);
          rewire();
          back.dispose();
          resolve();
        };
        const timer = setTimeout(finish, FADE_MS);
        fading = [...fading, { id, output: effect.output, back, finish }];
      });
    },
    dispose() {
      const previous = source;
      source = null;
      for (const f of fading) f.finish();
      rewire();
      previous?.disconnect();
      for (const back of returns.values()) back.dispose();
      for (const level of [mute, feed, channel, send]) level.dispose();
    },
  };
}
