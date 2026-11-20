import { describe, expect, it } from "vitest";
import { FACES, inBox, ORIGINS, TILE, VIEW } from "./geometry.ts";
import { drawKnots, drawLianas, LIANA_VIEW, tiePoints } from "./liana.ts";
import { createOutline } from "./outline.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

const outline = createOutline(9);
const tied = drawLianas(outline, "tl", "tied");
const loose = drawLianas(outline, "tl", "loose");
const short = drawLianas(outline, "tl", "short");
const knots = drawKnots(outline, "tl");
const ties = tiePoints(outline, "tl");
const LEAF =
  /<use href="#(?:ivy5|ivy3|heart|young)" transform="translate\((-?\d+) (-?\d+)\)/g;
const leaves = (svg: string): readonly (readonly [number, number])[] =>
  [...svg.matchAll(LEAF)].map((m) => [Number(m[1]), Number(m[2])] as const);
const lowest = (svg: string, id: string): number =>
  Math.max(...pathPoints(svg, id).map((p) => p[1]));
const viewBox = (box: (typeof LIANA_VIEW)["tied"]): string =>
  `viewBox="${String(box.left)} ${String(box.top)} ${String(box.right - box.left)} ${String(box.bottom - box.top)}"`;

describe("tiePoints", () => {
  it("ties two lianas to the frame's top branch, and finds where they pass its bottom one", () => {
    expect(ties).toHaveLength(2);
    for (const tie of ties) {
      expect(tie.top[1]).toBeGreaterThan(TILE.top - 10);
      expect(tie.top[1]).toBeLessThan(TILE.top + 90);
      expect(tie.bottom[1]).toBeGreaterThan(TILE.bottom - 90);
      expect(Math.abs(tie.bottom[0] - tie.top[0])).toBeLessThan(40);
    }
    expect((ties[1]?.top[0] ?? 0) - (ties[0]?.top[0] ?? 0)).toBeGreaterThan(
      400,
    );
  });

  it("ties each corner's frame in its own places", () => {
    const firsts = ORIGINS.map(
      (origin) => tiePoints(outline, origin)[0]?.top[0],
    );

    expect(new Set(firsts).size).toBe(4);
  });
});

describe("drawLianas", () => {
  it("draws the same lianas every time", () => {
    expect(drawLianas(outline, "tl", "tied")).toBe(tied);
    expect(drawLianas(outline, "tr", "tied")).not.toBe(tied);
  });

  it("is well formed, refers only to what it defines, and fills its own box", () => {
    for (const [svg, hang] of [
      [tied, "tied"],
      [loose, "loose"],
      [short, "short"],
    ] as const) {
      const ids = new Set(idsOf(svg));

      expect(isWellFormed(svg)).toBe(true);
      expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(svg).toContain(viewBox(LIANA_VIEW[hang]));
    }
  });

  it("hangs two twisted strands each from above the tile down to where it is tied", () => {
    for (const [i, tie] of ties.entries()) {
      for (const strand of ["a", "b"]) {
        const points = pathPoints(tied, `h${String(i)}${strand}`);

        expect(points[0]?.[1]).toBeLessThan(LIANA_VIEW.tied.top);
        expect(Math.abs((points.at(-1)?.[1] ?? 0) - tie.top[1])).toBeLessThan(
          16,
        );
        expect(Math.abs((points.at(-1)?.[0] ?? 0) - tie.top[0])).toBeLessThan(
          12,
        );
      }
    }
  });

  it("is bare where it is tied: nothing to turn with the seasons", () => {
    expect(leaves(tied)).toEqual([]);
    expect(tied).not.toContain('id="ivy5"');
  });

  it("when loose, runs on behind the tile and hangs under it, one end longer than the other", () => {
    const ends = [lowest(loose, "h0b"), lowest(loose, "h1b")];

    for (const end of ends) expect(end).toBeGreaterThan(TILE.bottom + 180);
    expect(Math.abs((ends[0] ?? 0) - (ends[1] ?? 0))).toBeGreaterThan(40);
    // One strand of each gives out before the other.
    expect(lowest(loose, "h0a")).toBeLessThan(lowest(loose, "h0b"));
  });

  it("grows leaves on its loose ends only, under the frame's own ivy, and ends in a tendril", () => {
    const grown = leaves(loose);

    expect(grown.length).toBeGreaterThan(6);
    expect(grown.filter(([, y]) => y < TILE.bottom + 70)).toEqual([]);
    expect(
      grown.filter(
        ([x, y]) =>
          x < 16 || x > VIEW.width - 16 || y > LIANA_VIEW.loose.bottom - 14,
      ),
    ).toEqual([]);
    expect(loose.match(/stroke="#6f8f3a"/g)?.length).toBeGreaterThan(0);
  });

  it("when short, hangs less far, inside a smaller box", () => {
    for (const id of ["h0b", "h1b"]) {
      expect(lowest(short, id)).toBeLessThan(lowest(loose, id));
      expect(lowest(short, id)).toBeGreaterThan(TILE.bottom + 70);
      expect(lowest(short, id)).toBeLessThan(LIANA_VIEW.short.bottom - 20);
    }
    expect(LIANA_VIEW.short.bottom).toBeLessThan(LIANA_VIEW.loose.bottom);
    expect(leaves(short).length).toBeGreaterThan(1);
  });

  it("stays small", () => {
    expect(tied.length).toBeLessThan(9_000);
    expect(loose.length).toBeLessThan(26_000);
  });
});

describe("drawKnots", () => {
  it("binds each liana to the frame with turns of withy, in the frame layer and off the faces", () => {
    const strokes = [
      ...knots.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)C[^"]+"/g),
    ].map((m) => [Number(m[1]), Number(m[2])] as const);

    expect(isWellFormed(knots)).toBe(true);
    expect(knots).toContain(
      `viewBox="0 0 ${String(VIEW.width)} ${String(VIEW.height)}"`,
    );
    expect(strokes.length).toBeGreaterThanOrEqual(ties.length * 3 * 3);
    for (const point of strokes) {
      expect(inBox(FACES, point)).toBe(false);
      expect(
        ties.some(
          (tie) =>
            Math.hypot(point[0] - tie.top[0], point[1] - tie.top[1]) < 40,
        ),
      ).toBe(true);
    }
  });

  it("is the same every time, and small", () => {
    expect(drawKnots(outline, "tl")).toBe(knots);
    expect(knots.length).toBeLessThan(4_000);
  });
});
