import type { CaptureContext, LevelNode } from "./env.ts";

export type Edge = readonly [AudioNode, AudioNode];

/** A part of the chain, as what comes before and after it sees it. */
export interface Link {
  readonly input: AudioNode;
  readonly output: AudioNode;
}

/** Short enough to feel at once, long enough not to click. */
export const LEVEL_RAMP_MS = 20;

/** An insert below 100% wet: the effect, and the dry signal around it. */
export interface InsertSlot {
  readonly link: Link;
  /** Its own wiring, including to the effect. */
  readonly edges: readonly Edge[];
  /** 0 to 1. Dry and wet are one signal, so they cross linearly. */
  setMix(mix: number): void;
  dispose(): void;
}

interface SlotEffect extends Link {
  readonly id: string;
  /** Seconds; the dry signal is held back by this much to line up. */
  readonly latency?: number;
}

/**
 * The dry signal is delayed by the effect's latency: an undelayed one would
 * comb-filter the voice, with notches every 100 Hz for a 10 ms delay.
 */
export function createInsertSlot(
  capture: CaptureContext,
  effect: SlotEffect,
): InsertSlot {
  const { id, latency = 0 } = effect;
  const input = capture.createLevel(`insert:${id}`, 1);
  const dry = capture.createLevel(`dry:${id}`, 0);
  const wet = capture.createLevel(`wet:${id}`, 0);
  const sum = capture.createLevel(`sum:${id}`, 1);
  const delay =
    latency > 0 ? capture.createDelay(`dry delay:${id}`, latency) : null;
  const toDry: readonly Edge[] = delay
    ? [
        [input.node, delay.node],
        [delay.node, dry.node],
      ]
    : [[input.node, dry.node]];
  const levels: readonly LevelNode[] = [input, dry, wet, sum];
  return {
    link: { input: input.node, output: sum.node },
    edges: [
      ...toDry,
      [dry.node, sum.node],
      [input.node, effect.input],
      [effect.output, wet.node],
      [wet.node, sum.node],
    ],
    setMix(mix) {
      dry.set(1 - mix, LEVEL_RAMP_MS);
      wet.set(mix, LEVEL_RAMP_MS);
    },
    dispose() {
      delay?.dispose();
      for (const level of levels) level.dispose();
    },
  };
}
