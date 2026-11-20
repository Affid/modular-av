import { describe, expect, it } from "vitest";
import {
  COVER,
  FACES,
  inBox,
  inView,
  ORIGINS,
  TILE,
  VIEW,
} from "./geometry.ts";
import { grow, leafExtent } from "./growth.ts";
import { LEAF_SHAPES, leafOutline } from "./leaves.ts";
import { createOutline } from "./outline.ts";

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

    expect(leaves.length).toBeGreaterThan(30);
    expect(stalks.length).toBeGreaterThan(22);
    expect(stalks.length).toBeLessThanOrEqual(leaves.length);
  });

  it.each(SEEDS)(
    "keeps every leaf of seed %i in the picture and off faces, on any frame",
    (seed) => {
      for (const origin of ORIGINS)
        for (const outline of [
          undefined,
          createOutline(seed),
          createOutline(seed + 1),
        ]) {
          const points = grow(seed, origin, outline).leaves.flatMap(leafExtent);

          expect(points.filter((p) => !inView(p, 3))).toEqual([]);
          expect(points.filter((p) => inBox(FACES, p))).toEqual([]);
        }
    },
  );

  it.each(SEEDS)(
    "keeps every shoot of seed %i in the picture and off faces, on any frame",
    (seed) => {
      for (const outline of [undefined, createOutline(seed)]) {
        const { shoots } = grow(seed, "tl", outline);
        const points = shoots.flatMap((shoot) => shoot.map((s) => s.at));

        expect(shoots.length).toBeGreaterThan(2);
        expect(points.filter((p) => !inView(p, 4))).toEqual([]);
        expect(points.filter((p) => inBox(FACES, p))).toEqual([]);
      }
    },
  );

  it.each(SEEDS)(
    "keeps every stem of seed %i, at its full thickness, out of the picture's middle",
    (seed) => {
      const middle = {
        left: TILE.left + COVER * (TILE.right - TILE.left),
        right: TILE.right - COVER * (TILE.right - TILE.left),
        top: TILE.top + COVER * (TILE.bottom - TILE.top),
        bottom: TILE.bottom - COVER * (TILE.bottom - TILE.top),
      };
      /** How far outside the middle a point is: 0 on its edge or inside. */
      const clear = ([x, y]: readonly [number, number]): number =>
        Math.hypot(
          Math.max(middle.left - x, 0, x - middle.right),
          Math.max(middle.top - y, 0, y - middle.bottom),
        );
      for (const origin of ORIGINS)
        for (const outline of [createOutline(seed), createOutline(seed + 1)]) {
          const tight = grow(seed, origin, outline)
            .stems.flat()
            .filter((sample) => sample.shown)
            .filter((sample) => clear(sample.at) < sample.width / 2 + 2);

          expect(tight).toEqual([]);
        }
    },
  );

  it("grows along its frame's outline: where the frame bulges in, so do the stems", () => {
    const outline = createOutline(9);
    const [plain, bent] = [grow(11, "tl"), grow(11, "tl", outline)];
    const moved = plain.stems.flatMap((stem, i) =>
      stem.map((sample, k) => {
        const there = bent.stems[i]?.[k]?.at ?? sample.at;
        return Math.hypot(there[0] - sample.at[0], there[1] - sample.at[1]);
      }),
    );

    expect(bent.stems.map((s) => s.length)).toEqual(
      plain.stems.map((s) => s.length),
    );
    expect(Math.max(...moved)).toBeGreaterThan(15);
  });

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
