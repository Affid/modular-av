import { describe, expect, it } from "vitest";
import {
  joined,
  lineOf,
  lineThrough,
  picture,
  single,
  type Strand,
  twist,
} from "./strands.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

const down = lineOf((d) => [100, d]);
const strand = (id: string, width: number, amp: number, turn = 0): Strand => ({
  id,
  width,
  tone: ["#6f4d2c", "#c49a63"],
  from: 0,
  to: 400,
  sway: (d) => amp * Math.sin((2 * Math.PI * d) / 200 + turn),
});
const BOX = { left: 0, top: 0, right: 200, bottom: 400 };
const SHADOW = { dx: 3, dy: 6, blur: 4 };

describe("lineOf", () => {
  it("puts a point to the side of the line: to the left of one that runs down", () => {
    expect(down.point(50, 0)).toEqual([100, 50]);
    expect(down.point(50, 10)).toEqual([90, 50]);
  });

  it("follows a line that turns", () => {
    const across = lineOf((d) => [400 - d, 20]);

    // Running to the left, its side is up.
    expect(across.point(100, 5)).toEqual([300, 15]);
  });
});

describe("lineThrough", () => {
  it("measures a line through points and walks it by distance", () => {
    const { line, length } = lineThrough([
      [0, 0],
      [30, 40],
      [30, 100],
    ]);

    expect(length).toBe(110);
    expect(line.point(25, 0)).toEqual([15, 20]);
    expect(line.point(80, 0)).toEqual([30, 70]);
  });
});

describe("twist", () => {
  const drawn = twist("t", down, [
    strand("a", 30, 12),
    strand("b", 24, 12, Math.PI),
    strand("c", 9, 18),
  ]);
  const svg = picture(BOX, drawn, SHADOW);

  it("draws every strand along the line, swaying to its sides", () => {
    for (const id of ["ta", "tb", "tc"]) {
      const points = pathPoints(svg, id);

      expect(points.length).toBeGreaterThan(10);
      expect(points[0]?.[1]).toBe(0);
      expect(points.at(-1)?.[1]).toBe(400);
      expect(points.every((p) => Math.abs(p[0] - 100) <= 19)).toBe(true);
    }
    expect(pathPoints(svg, "ta").some((p) => p[0] < 92)).toBe(true);
    expect(pathPoints(svg, "ta").some((p) => p[0] > 108)).toBe(true);
  });

  it("puts the first strand over the second at every other crossing", () => {
    // Two strands half a turn apart cross twice a turn: four times in 400.
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain('<g clip-path="url(#to)">');
  });

  it("casts a shadow of the thick strands only", () => {
    const shadow =
      /<g filter="url\(#fs\)"[^>]*>(.*?)<\/g>/.exec(svg)?.[1] ?? "";

    expect(shadow).toContain('href="#ta"');
    expect(shadow).toContain('href="#tb"');
    expect(shadow).not.toContain('href="#tc"');
  });

  it("is well formed and refers only to what it defines", () => {
    const ids = new Set(idsOf(svg));

    expect(isWellFormed(svg)).toBe(true);
    expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
    expect(new Set(idsOf(svg)).size).toBe(idsOf(svg).length);
  });
});

describe("single, joined and picture", () => {
  const twig = single(
    "g1",
    [
      [0, 0],
      [40, 10],
      [80, 40],
      [120, 90],
    ],
    8,
    ["#5d3f24", "#b0844f"],
  );

  it("draws one branch through its points", () => {
    const svg = picture(BOX, twig, SHADOW);

    expect(pathPoints(svg, "g1")[0]).toEqual([0, 0]);
    expect(pathPoints(svg, "g1").at(-1)).toEqual([120, 90]);
  });

  it("joins drawings into one picture, with what is laid over them last", () => {
    const both = joined([
      twig,
      twist("t", down, [strand("a", 30, 12), strand("b", 24, 12, 3)]),
    ]);
    const svg = picture(BOX, both, SHADOW, '<circle id="over" r="1"/>');

    expect(idsOf(svg)).toEqual(
      expect.arrayContaining(["g1", "ta", "tb", "over"]),
    );
    expect(svg.indexOf('id="over"')).toBeGreaterThan(
      svg.lastIndexOf('href="#ta"'),
    );
    expect(isWellFormed(svg)).toBe(true);
  });

  it("gives a picture its own size when it is cut into slices", () => {
    const svg = picture(BOX, twig, SHADOW, "", { width: 50, height: 100 });

    expect(svg).toContain('width="50" height="100" viewBox="0 0 200 400"');
  });
});
