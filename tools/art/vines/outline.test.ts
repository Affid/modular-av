import { describe, expect, it } from "vitest";
import { COVER, inBox, type Point, SIDES, TILE } from "./geometry.ts";
import { CORNERS, loopSpot, PERIMETER } from "./loop.ts";
import {
  bendOnto,
  BUNDLE_HALF,
  coverDepth,
  createOutline,
  PLAIN_OUTLINE,
} from "./outline.ts";

const SEEDS = [1, 4, 9, 17, 31, 77];
const steps = Array.from({ length: 720 }, (_, i) => (PERIMETER * i) / 720);
/** The middle of the picture, which no frame may cover. */
const MIDDLE = {
  left: TILE.left + COVER * (TILE.right - TILE.left),
  right: TILE.right - COVER * (TILE.right - TILE.left),
  top: TILE.top + COVER * (TILE.bottom - TILE.top),
  bottom: TILE.bottom - COVER * (TILE.bottom - TILE.top),
};
const far = (a: Point, b: Point): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("createOutline", () => {
  it("is the same outline for the same seed, another for another", () => {
    const depths = (seed: number): readonly number[] => {
      const outline = createOutline(seed);
      return steps.slice(0, 40).map((s) => outline.depth(s));
    };

    expect(depths(9)).toEqual(depths(9));
    expect(depths(9)).not.toEqual(depths(4));
  });

  it.each(SEEDS)(
    "wanders with seed %i: deep in places, shallow in others",
    (seed) => {
      const outline = createOutline(seed);
      const depths = steps.map((s) => outline.depth(s));

      expect(Math.min(...depths)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(12);
    },
  );

  it.each(SEEDS)(
    "keeps the whole bundle of seed %i out of the picture's middle",
    (seed) => {
      const outline = createOutline(seed);
      const inner = steps.map((s) => outline.point(s, -BUNDLE_HALF));

      expect(inner.filter((p) => inBox(MIDDLE, p))).toEqual([]);
    },
  );

  it("closes on itself and never turns sharply", () => {
    const outline = createOutline(9);
    const slopes = steps.map(
      (s) => Math.abs(outline.depth(s + 4) - outline.depth(s)) / 4,
    );

    expect(Math.max(...slopes)).toBeLessThan(0.45);
    expect(outline.point(PERIMETER + 30, 0)[0]).toBeCloseTo(
      outline.point(30, 0)[0],
    );
    expect(
      far(outline.point(PERIMETER - 2, 0), outline.point(2, 0)),
    ).toBeLessThan(6);
  });

  it("stays calm where the dock puts the player's name and the tile's menu", () => {
    for (const seed of SEEDS) {
      const outline = createOutline(seed);

      expect(outline.depth(CORNERS.bottomLeft)).toBeLessThan(14);
      expect(outline.depth(CORNERS.topRight)).toBeLessThan(24);
    }
  });
});

describe("coverDepth", () => {
  it("allows less from the top and bottom than from the sides", () => {
    expect(coverDepth(100)).toBeLessThan(coverDepth(CORNERS.topRight + 200));
  });
});

describe("PLAIN_OUTLINE", () => {
  it("is the loop itself", () => {
    expect(PLAIN_OUTLINE.depth(123)).toBe(0);
    expect(PLAIN_OUTLINE.point(50, 0)).toEqual(loopSpot(50).at);
    expect(PLAIN_OUTLINE.point(50, 10)[1]).toBeCloseTo(loopSpot(50).at[1] - 10);
  });
});

describe("bendOnto", () => {
  const bend = bendOnto(PLAIN_OUTLINE);
  const middle = (SIDES.left + SIDES.right) / 2;

  it("puts the straight frame's centre line on the bundle's", () => {
    const top = bend([middle, SIDES.top]);

    expect(top.at[1]).toBeCloseTo(loopSpot(0).at[1]);
    expect(top.at[0]).toBeCloseTo(middle);
    expect(top.turn).toBeCloseTo(0);
  });

  it("keeps a point's distance out from the frame, on every side", () => {
    const out = 25;
    const sides: readonly (readonly [Point, Point])[] = [
      [
        [middle, SIDES.top - out],
        [0, -1],
      ],
      [
        [SIDES.right + out, 400],
        [1, 0],
      ],
      [
        [middle, SIDES.bottom + out],
        [0, 1],
      ],
      [
        [SIDES.left - out, 400],
        [-1, 0],
      ],
    ];

    for (const [point, way] of sides) {
      const [on, off] = [
        bend([point[0] - way[0] * out, point[1] - way[1] * out]),
        bend(point),
      ];

      expect(
        (off.at[0] - on.at[0]) * way[0] + (off.at[1] - on.at[1]) * way[1],
      ).toBeCloseTo(out);
    }
  });

  it("turns directions round a corner, where the straight frame had none", () => {
    const beside = bend([SIDES.right - 20, SIDES.top]);

    expect(beside.turn).toBeGreaterThan(0.1);
    expect(beside.turn).toBeLessThan(Math.PI / 4 + 0.01);
  });

  it("takes a point to nearly the same place from either side of a corner's diagonal", () => {
    const [a, b] = [
      bend([SIDES.left - 30, SIDES.top - 29.9]),
      bend([SIDES.left - 29.9, SIDES.top - 30]),
    ];

    expect(far(a.at, b.at)).toBeLessThan(2);
  });

  it("takes a point inside the frame to nearly the same place from either side of a corner's diagonal", () => {
    const [a, b] = [
      bend([SIDES.left + 30, SIDES.top + 31]),
      bend([SIDES.left + 31, SIDES.top + 30]),
    ];

    expect(far(a.at, b.at)).toBeLessThan(3);
  });

  it("leaves a point inside the frame where it was along its side, away from the corners", () => {
    const [on, inside] = [
      bend([middle, SIDES.top]),
      bend([middle, SIDES.top + 30]),
    ];

    expect(inside.at[0]).toBeCloseTo(on.at[0]);
    expect(inside.at[1] - on.at[1]).toBeCloseTo(30);
  });

  it("gives every turn as the short way round", () => {
    const points: readonly Point[] = [
      [SIDES.left - 20, 300],
      [SIDES.left - 20, SIDES.top - 20],
      [SIDES.left + 5, SIDES.top - 30],
      [SIDES.right + 20, SIDES.bottom + 20],
      [middle, SIDES.bottom + 20],
    ];

    for (const point of points)
      expect(Math.abs(bend(point).turn)).toBeLessThanOrEqual(Math.PI);
  });

  it("follows an outline's bulges", () => {
    const outline = createOutline(9);
    const deepest = steps.reduce(
      (best, s) => (outline.depth(s) > outline.depth(best) ? s : best),
      0,
    );
    const { at } = loopSpot(deepest);

    expect(far(outline.point(deepest, 0), at)).toBeGreaterThan(10);
  });
});
