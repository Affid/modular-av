import { describe, expect, it } from "vitest";
import { isWellFormed } from "../vines/svg.ts";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import { TALLY } from "./geometry.ts";
import { drawDaubs } from "./paint.ts";
import { drawTally, GROUPS, STROKES } from "./tally.ts";

const polygons = (svg: string): readonly string[] =>
  [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1] ?? "");

describe("the tally marks", () => {
  const svg = drawTally();

  it("are a well-formed picture as large as their row, stretched with it", () => {
    expect(isWellFormed(svg)).toBe(true);
    expect(svg).toContain(
      `viewBox="${String(TALLY.left)} ${String(TALLY.top)} ${String(widthOf(TALLY))} ${String(heightOf(TALLY))}"`,
    );
    expect(svg).toContain('preserveAspectRatio="none"');
  });

  it("count in fives: four strokes and one across them, five times", () => {
    expect(GROUPS).toBe(5);
    expect(STROKES).toBe(4);
    expect(polygons(svg)).toHaveLength(GROUPS * (STROKES + 1));
  });

  it("stay inside their row, give or take the brush", () => {
    const margin = 16;
    for (const points of polygons(svg))
      for (const point of points.split(" ")) {
        const [x = 0, y = 0] = point.split(",").map(Number);
        expect(x).toBeGreaterThan(TALLY.left - margin);
        expect(x).toBeLessThan(TALLY.right + margin);
        expect(y).toBeGreaterThan(TALLY.top - margin);
        expect(y).toBeLessThan(TALLY.bottom + margin);
      }
  });

  it("are the same every time they are drawn", () => {
    expect(drawTally()).toBe(svg);
  });
});

describe("the war paint's daubs", () => {
  it("are drawn from each corner of the picture along both its edges, twice over", () => {
    expect(polygons(drawDaubs(0))).toHaveLength(4 * 4);
  });

  it("differ from one hide to the other, and never from one drawing to the next", () => {
    expect(drawDaubs(0)).toBe(drawDaubs(0));
    expect(drawDaubs(0)).not.toBe(drawDaubs(1));
  });

  it("refuse a hide that isn't there", () => {
    expect(() => drawDaubs(2)).toThrow(/hide/);
  });
});
