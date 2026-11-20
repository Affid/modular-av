import { describe, expect, it } from "vitest";
import { FACES, inBox, inView, ORIGINS, VIEW } from "./geometry.ts";
import { grow, leafExtent } from "./growth.ts";
import { LEAF_SHAPES, leafOutline } from "./leaves.ts";

const SEEDS = [1, 11, 23, 37, 53, 99];

describe("grow", () => {
  it("grows the same vines from the same seed", () => {
    expect(grow(11, "tl")).toEqual(grow(11, "tl"));
  });

  it("grows other vines from another seed", () => {
    expect(grow(11, "tl").leaves).not.toEqual(grow(12, "tl").leaves);
  });

  it("winds four stems round the frame, two from each of two corners", () => {
    const { stems } = grow(11, "tl");

    expect(stems).toHaveLength(4);
    // Each passes behind the frame somewhere, and comes back.
    for (const stem of stems) {
      expect(stem.some((s) => !s.shown)).toBe(true);
      expect(stem.at(-1)?.shown).toBe(true);
    }
  });

  it("tapers each stem toward its tip", () => {
    for (const stem of grow(11, "tl").stems)
      expect(stem.at(-1)?.width).toBeLessThan(stem[0]?.width ?? 0);
  });

  it("is leafy, with a stalk to each leaf along a stem", () => {
    const { leaves, stalks } = grow(11, "tl");

    expect(leaves.length).toBeGreaterThan(40);
    expect(stalks.length).toBeGreaterThan(30);
    expect(stalks.length).toBeLessThanOrEqual(leaves.length);
  });

  it.each(SEEDS)(
    "keeps every leaf of seed %i in the picture and off faces",
    (seed) => {
      for (const origin of ORIGINS) {
        const points = grow(seed, origin).leaves.flatMap(leafExtent);

        expect(points.filter((p) => !inView(p, 3))).toEqual([]);
        expect(points.filter((p) => inBox(FACES, p))).toEqual([]);
      }
    },
  );

  it.each(SEEDS)(
    "keeps every shoot of seed %i in the picture and off faces",
    (seed) => {
      const { shoots } = grow(seed, "tl");
      const points = shoots.flatMap((shoot) => shoot.map((s) => s.at));

      expect(shoots.length).toBeGreaterThan(2);
      expect(points.filter((p) => !inView(p, 4))).toEqual([]);
      expect(points.filter((p) => inBox(FACES, p))).toEqual([]);
    },
  );

  it("measures a leaf as wide as the widest shape is drawn", () => {
    const widest = Math.max(
      ...LEAF_SHAPES.flatMap((shape) =>
        [...leafOutline(shape).matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((m) =>
          Math.abs(Number(m[1])),
        ),
      ),
    );
    const [, , side] = leafExtent({ base: [0, 0], angle: 0, length: 100 });

    expect(Math.abs(side?.[1] ?? 0)).toBeGreaterThanOrEqual(widest);
  });

  it("keeps the leaves' sizes within what reads at a tile's size", () => {
    const lengths = grow(11, "tl").leaves.map((l) => l.length);

    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...lengths)).toBeLessThan(125);
  });

  it("marks about one leaf in seven as hardy enough to outlast the rest", () => {
    const leaves = SEEDS.flatMap((seed) => grow(seed, "tl").leaves);
    const hardy = leaves.filter((l) => l.hardy < 0.14).length;

    expect(hardy / leaves.length).toBeGreaterThan(0.07);
    expect(hardy / leaves.length).toBeLessThan(0.22);
  });

  it("grows the other corners as mirror images of the top left", () => {
    const from = grow(11, "tl");
    const across = grow(11, "tr");
    const under = grow(11, "bl");

    expect(across.leaves).toHaveLength(from.leaves.length);
    const [leaf, mirrored, flipped] = [
      from.leaves[0],
      across.leaves[0],
      under.leaves[0],
    ];
    expect(mirrored?.base[0]).toBeCloseTo(VIEW.width - (leaf?.base[0] ?? 0));
    expect(mirrored?.base[1]).toBeCloseTo(leaf?.base[1] ?? 0);
    expect(flipped?.base[1]).toBeCloseTo(VIEW.height - (leaf?.base[1] ?? 0));
    expect(across.stems[0]?.[3]?.at[0]).toBeCloseTo(
      VIEW.width - (from.stems[0]?.[3]?.at[0] ?? 0),
    );
  });

  it("grows most from the corner it is named for", () => {
    const from =
      (corner: readonly [number, number]) => (p: readonly [number, number]) =>
        Math.hypot(p[0] - corner[0], p[1] - corner[1]);
    const toOrigin = from([VIEW.width, VIEW.height]);
    const toOpposite = from([0, 0]);
    const bases = grow(11, "br").leaves.map((l) => l.base);

    const nearer = bases.filter((p) => toOrigin(p) < toOpposite(p)).length;

    expect(nearer).toBeGreaterThan(bases.length - nearer);
  });
});
