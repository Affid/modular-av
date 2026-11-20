import { describe, expect, it } from "vitest";
import { TRUNK, UNITS } from "./plant.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";
import { drawTrunk } from "./trunk.ts";

const WIDE = TRUNK.width * UNITS;
const LONG = TRUNK.period * UNITS;
const down = drawTrunk(71, "down");
const across = drawTrunk(71, "across");
const LEAF =
  /<use href="#(?:ivy5|ivy3|heart|young)" transform="translate\((-?\d+) (-?\d+)\)/g;
const leaves = (svg: string): readonly (readonly [number, number])[] =>
  [...svg.matchAll(LEAF)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe("drawTrunk", () => {
  it("draws the same trunk every time, and another for another seed", () => {
    expect(drawTrunk(71, "down")).toBe(down);
    expect(drawTrunk(72, "down")).not.toBe(down);
  });

  it("is well formed and refers only to what it defines", () => {
    for (const svg of [down, across]) {
      const ids = new Set(idsOf(svg));

      expect(isWellFormed(svg)).toBe(true);
      expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it("fills a tile as wide as the trunk and one period long, either way", () => {
    expect(down).toContain(`viewBox="0 0 ${String(WIDE)} ${String(LONG)}"`);
    expect(across).toContain(`viewBox="0 0 ${String(LONG)} ${String(WIDE)}"`);
  });

  it("runs four strands of different thickness right through the tile", () => {
    const widths = ["ta", "tb", "tc", "td"].map(
      (id) =>
        new RegExp(
          `<use href="#${id}" stroke="#[0-9a-f]+" stroke-width="([\\d.]+)"`,
        ).exec(down)?.[1],
    );

    expect(new Set(widths).size).toBe(4);
    for (const id of ["ta", "tb", "tc", "td"]) {
      const ys = pathPoints(down, id).map((p) => p[1]);

      expect(Math.min(...ys)).toBeLessThan(0);
      expect(Math.max(...ys)).toBeGreaterThan(LONG);
    }
  });

  it("repeats without a seam: a period on, every strand is where it was", () => {
    // A path's own points, without the handles between them: the first, then every second pair from the fourth.
    const onPath = (id: string): readonly (readonly [number, number])[] =>
      pathPoints(down, id).filter((_, i) => i === 0 || (i >= 3 && i % 2 === 1));
    /** The strands are sampled eighty times a period. */
    const period = 80;

    for (const id of ["ta", "tb", "tc", "td"]) {
      const points = onPath(id);

      expect(points.length).toBeGreaterThan(period);
      for (const [i, point] of points.entries()) {
        const later = points[i + period];
        if (!later) continue;
        expect(Math.abs(later[0] - point[0])).toBeLessThanOrEqual(1);
        expect(Math.abs(later[1] - point[1] - LONG)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps its centre line where the stylesheet puts the dock's edge", () => {
    const xs = pathPoints(down, "ta").map((p) => p[0]);
    const centre = (TRUNK.width - TRUNK.centre) * UNITS;

    expect(
      Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - centre),
    ).toBeLessThan(8);
    expect(Math.max(...pathPoints(down, "t").map((p) => p[0]))).toBeLessThan(
      WIDE - 6,
    );
  });

  it("sends shorter branches off it that come back, further into the dock than out of it", () => {
    const sides = idsOf(down).filter((id) => /^ts\d$/.test(id));
    const reach = (id: string): readonly number[] =>
      pathPoints(down, id).map((p) => p[0]);
    const centre = (TRUNK.width - TRUNK.centre) * UNITS;
    const all = sides.flatMap(reach);

    expect(sides.length).toBeGreaterThanOrEqual(4);
    expect(centre - Math.min(...all)).toBeGreaterThan(
      Math.max(...all) - centre,
    );
  });

  it("grows ivy on stretches of it only, clear of the seam, so no leaf is cut", () => {
    const grown = leaves(down);

    expect(grown.length).toBeGreaterThan(8);
    expect(grown.filter(([, y]) => y < 36 || y > LONG - 36)).toEqual([]);
    expect(grown.filter(([x]) => x < 8 || x > WIDE - 6)).toEqual([]);
    // A bare stretch between the two it grows on.
    expect(grown.filter(([, y]) => y > LONG * 0.42 && y < LONG * 0.52)).toEqual(
      [],
    );
  });

  it("draws the trunk across the same way round: its inner side is under it", () => {
    const ys = pathPoints(across, "ta").map((p) => p[1]);
    const xs = pathPoints(across, "ta").map((p) => p[0]);
    const sides = idsOf(across)
      .filter((id) => /^ts\d$/.test(id))
      .flatMap((id) => pathPoints(across, id).map((p) => p[1]));
    const centre = TRUNK.centre * UNITS;

    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(LONG);
    expect(
      Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - centre),
    ).toBeLessThan(8);
    expect(Math.max(...sides) - centre).toBeGreaterThan(
      centre - Math.min(...sides),
    );
  });

  it("stays small", () => {
    expect(down.length).toBeLessThan(36_000);
    expect(across.length).toBeLessThan(36_000);
  });
});
