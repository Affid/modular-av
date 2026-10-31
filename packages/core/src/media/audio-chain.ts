import type { AudioPlace } from "@modular-av/api";
import { AUDIO_PLACES } from "./audio-places.ts";
import type { EffectOrder } from "./effect-places.ts";
import {
  createInsertSlot,
  LEVEL_RAMP_MS,
  type Edge,
  type InsertSlot,
  type Link,
} from "./insert-slot.ts";
import {
  GATE_FEED_OUTPUT,
  GATE_SEND_OUTPUT,
  type CaptureContext,
  type LevelNode,
} from "./env.ts";

/** A running audio effect, as the chain wires it. */
export interface ChainEffect {
  readonly id: string;
  readonly place: AudioPlace;
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** Seconds, if declared: an insert may then have a dry branch. */
  readonly latency?: number;
}

/**
 * The microphone chain in the capture context (docs/voice-routing.md):
 * source → pre-gate → gate → mute → post feed → post-gate → Channel level →
 * destination, and after post-gate a copy → Send on/off → one FX channel per
 * effect on a send → its Return level → destination. An insert below 100% wet
 * has a dry branch of its own (`insert-slot.ts`). Every change connects the
 * new path before cutting the old one, in one task, so audio neither stops
 * nor skips an effect.
 */
export interface AudioChain {
  /** The raw microphone, or null for none. */
  setSource(track: MediaStreamTrack | null): void;
  /** The raw microphone's node in the chain. */
  readonly source: AudioNode | null;
  /** What post-gate effects get. */
  readonly postFeed: AudioNode;
  /** What effects on a send get. */
  readonly sendBus: AudioNode;
  /** In the order they run; see `orderByPlace`. */
  setEffects(effects: readonly ChainEffect[]): void;
  setGate(gate: AudioNode | null): void;
  /** Whether the voice may go on past the gate; closed until told. */
  setOpen(open: boolean): void;
  /** The gate's message, for browsers where a level can't follow it. */
  setSpeaking(speaking: boolean): void;
  /** The dry amount, 0 to 1. */
  setChannelLevel(level: number): void;
  /** An effect's wet amount, 0 to 1, also before it runs. */
  setMix(id: string, mix: number): void;
  /**
   * Fades the Return of an effect on a send out, keeping its output connected through
   * the `setEffects` that follows; resolves once it is cut. Null for an
   * effect with nothing to fade.
   */
  fade(id: string): Promise<void> | null;
  dispose(): void;
}

const INSERTS: readonly AudioPlace[] = ["pre-gate", "post-gate"];

const FADE_MS = 50;
/** Keeps a mid-word mute from clicking into the tails. */
const MUTE_RAMP_MS = 5;
/** As the gate's own ramps, for browsers where a level can't follow it. */
const SEND_OPEN_MS = 5;
const SEND_CLOSE_MS = 50;

/**
 * By place; within one, the player's `order`, with what must come first ahead
 * of it unless the order lists it, and the rest as given behind it.
 */
export function orderByPlace(
  effects: readonly ChainEffect[],
  isFirst: (id: string) => boolean = () => false,
  order: Partial<EffectOrder> = {},
): readonly ChainEffect[] {
  return AUDIO_PLACES.flatMap((place) => {
    const here = effects.filter((e) => e.place === place);
    const listed = order[place] ?? [];
    const rest = here.filter((e) => !listed.includes(e.id));
    return [
      ...rest.filter((e) => isFirst(e.id)),
      ...listed.flatMap((id) => here.filter((e) => e.id === id)),
      ...rest.filter((e) => !isFirst(e.id)),
    ];
  });
}

/** An effect on a send, on its way out. */
interface Fading {
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
  let open = false;
  let speaking = false;
  let channelLevel = 1;
  let mixes: ReadonlyMap<string, number> = new Map();
  let returns: ReadonlyMap<string, LevelNode> = new Map();
  let slots: ReadonlyMap<string, InsertSlot> = new Map();
  /** Set while a slot back at 100% wet fades before it leaves. */
  let settling: ReturnType<typeof setTimeout> | null = null;
  let fading: readonly Fading[] = [];
  const mute = capture.createLevel("mute", 0);
  const feed = capture.createLevel("post feed", 1);
  const channel = capture.createLevel("channel", 1);
  const send = capture.createLevel("send", 1);

  const inPlaces = (places: readonly AudioPlace[]): readonly ChainEffect[] =>
    effects.filter((e) => places.includes(e.place));
  const sends = (): readonly ChainEffect[] => inPlaces(["send"]);

  const linked = (place: AudioPlace): readonly Link[] =>
    inPlaces([place]).map((e) => slots.get(e.id)?.link ?? e);

  const mainPath = (from: AudioNode): readonly Link[] => {
    const node = (n: AudioNode): Link => ({ input: n, output: n });
    return [
      node(from),
      ...linked("pre-gate"),
      ...(gate ? [node(gate)] : []),
      node(mute.node),
      node(feed.node),
      ...linked("post-gate"),
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
    const branches = [...slots.values()].flatMap((slot) => slot.edges);
    return [...main, ...branches, ...sendEdges(tap), ...leaving];
  };

  const rewire = (): void => {
    const next = wanted();
    for (const edge of next)
      if (!edges.some((e) => same(e, edge))) edge[0].connect(edge[1]);
    for (const edge of edges)
      if (!next.some((e) => same(e, edge))) edge[0].disconnect(edge[1]);
    edges = next;
  };

  const levelOf = (id: string): number => mixes.get(id) ?? 1;

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

  /** Replaces the dry branches with `next`, the new path first. */
  const swapSlots = (next: ReadonlyMap<string, InsertSlot>): void => {
    const before = slots;
    slots = next;
    rewire();
    for (const [id, slot] of before) if (!slots.has(id)) slot.dispose();
  };

  const isBelowFull = (id: string): boolean => levelOf(id) < 1;

  /** Drops the slots back at 100% wet: they are plain links again. */
  const settle = (): void => {
    if (settling !== null) clearTimeout(settling);
    settling = null;
    swapSlots(new Map([...slots].filter(([id]) => isBelowFull(id))));
  };

  /** A slot leaves only after its fade: dropping it mid-fade would step. */
  const applySlots = (): void => {
    swapSlots(
      new Map(
        inPlaces(INSERTS).flatMap((e) => {
          const known = slots.get(e.id);
          if (e.latency === undefined) return [];
          if (!known && !isBelowFull(e.id)) return [];
          const slot = known ?? createInsertSlot(capture, e);
          slot.setMix(levelOf(e.id));
          return [[e.id, slot] as const];
        }),
      ),
    );
    if (settling !== null) clearTimeout(settling);
    settling = [...slots.keys()].some((id) => !isBelowFull(id))
      ? setTimeout(settle, LEVEL_RAMP_MS)
      : null;
  };

  const applySend = (): void => {
    if (capture.canFollow) {
      feed.follow(gate, GATE_FEED_OUTPUT);
      send.follow(gate, GATE_SEND_OUTPUT);
      return;
    }
    const opening = gate === null || speaking;
    send.set(opening ? 1 : 0, opening ? SEND_OPEN_MS : SEND_CLOSE_MS);
  };
  applySend();

  return {
    get source() {
      return source;
    },
    postFeed: feed.node,
    sendBus: send.node,
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
      applySlots();
      for (const [id, back] of before) if (!returns.has(id)) back.dispose();
      applyChannel();
    },
    setGate(next) {
      gate = next;
      rewire();
      applySend();
    },
    setOpen(next) {
      if (next === open) return;
      open = next;
      mute.set(open ? 1 : 0, MUTE_RAMP_MS);
    },
    setSpeaking(next) {
      speaking = next;
      if (!capture.canFollow) applySend();
    },
    setChannelLevel(level) {
      if (level === channelLevel) return;
      channelLevel = level;
      applyChannel();
    },
    setMix(id, mix) {
      if (mix === mixes.get(id)) return;
      mixes = new Map(mixes).set(id, mix);
      returns.get(id)?.set(mix, LEVEL_RAMP_MS);
      applySlots();
      applyChannel();
    },
    fade(id) {
      const effect = sends().find((e) => e.id === id);
      const back = returns.get(id);
      if (!effect || !back) return null;
      returns = new Map([...returns].filter(([key]) => key !== id));
      back.set(0, FADE_MS);
      return new Promise((resolve) => {
        const entry: Fading = {
          output: effect.output,
          back,
          finish() {
            clearTimeout(timer);
            fading = fading.filter((f) => f !== entry);
            rewire();
            back.dispose();
            resolve();
          },
        };
        const timer = setTimeout(() => {
          entry.finish();
        }, FADE_MS);
        fading = [...fading, entry];
      });
    },
    dispose() {
      const previous = source;
      source = null;
      for (const f of fading) f.finish();
      if (settling !== null) clearTimeout(settling);
      rewire();
      previous?.disconnect();
      for (const back of returns.values()) back.dispose();
      for (const slot of slots.values()) slot.dispose();
      for (const level of [mute, feed, channel, send]) level.dispose();
    },
  };
}
