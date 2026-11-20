import { describe, expect, it } from "vitest";
import { leafExtent } from "./growth.ts";
import { createRandom } from "./random.ts";
import { growAlong, type SprigPlan } from "./sprig.ts";
import type { Point } from "./geometry.ts";

/** A path 600 long, running right. */
const PATH: readonly Point[] = Array.from({ length: 61 }, (_, i) => [
  i * 10,
  100,
]);
const anywhere: SprigPlan = { big: 80, small: 40, every: 50, keep: () => true };

describe("growAlong", () => {
  const sprig = growAlong(createRandom(4), PATH, anywhere);

  it("grows the same sprig from the same seed", () => {
    expect(growAlong(createRandom(4), PATH, anywhere)).toEqual(sprig);
    expect(growAlong(createRandom(5), PATH, anywhere)).not.toEqual(sprig);
  });

  it("puts leaves along the path, about as far apart as planned, on both sides", () => {
    expect(sprig.leaves.length).toBeGreaterThanOrEqual(8);
    expect(sprig.leaves.length).toBeLessThanOrEqual(16);
    expect(sprig.leaves.some((leaf) => leaf.base[1] < 100)).toBe(true);
    expect(sprig.leaves.some((leaf) => leaf.base[1] > 100)).toBe(true);
  });

  it("gives every leaf a stalk from the path, and the path as a shoot", () => {
    expect(sprig.stalks).toHaveLength(sprig.leaves.length);
    for (const [from] of sprig.stalks) expect(from[1]).toBe(100);
    expect(sprig.shoots).toHaveLength(1);
    expect(sprig.shoots[0]?.[0]?.at).toEqual([0, 100]);
    expect(sprig.stems).toEqual([]);
  });

  it("grows smaller leaves toward the end, the last of them young", () => {
    const [first, second] = [
      sprig.leaves.filter((leaf) => leaf.base[0] < 300),
      sprig.leaves.filter((leaf) => leaf.base[0] >= 300),
    ];
    const mean = (leaves: typeof first): number =>
      leaves.reduce((sum, leaf) => sum + leaf.length, 0) / leaves.length;

    expect(mean(first)).toBeGreaterThan(mean(second));
    expect(sprig.leaves.at(-1)?.young).toBe(true);
  });

  it("grows no leaf that would reach where it may not, trying the other side first", () => {
    const above = (p: Point): boolean => p[1] <= 104;
    const kept = growAlong(createRandom(4), PATH, { ...anywhere, keep: above });

    expect(kept.leaves.length).toBeGreaterThan(4);
    for (const leaf of kept.leaves)
      expect(leafExtent(leaf).every(above)).toBe(true);
  });

  it("can leave the shoot out, for leaves on a branch that is drawn already", () => {
    const bare = growAlong(createRandom(4), PATH, {
      ...anywhere,
      shoot: false,
    });

    expect(bare.shoots).toEqual([]);
    expect(bare.leaves.length).toBeGreaterThan(4);
  });

  it("grows nothing where nothing fits", () => {
    const none = growAlong(createRandom(4), PATH, {
      ...anywhere,
      keep: () => false,
    });

    expect(none.leaves).toEqual([]);
    expect(none.stalks).toEqual([]);
  });
});
