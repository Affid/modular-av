import { describe, expect, it } from "vitest";
import { createRandom } from "../vines/random.ts";
import { isWellFormed } from "../vines/svg.ts";
import { LINE } from "./geometry.ts";
import { SIGIL_COUNT, sigilRow } from "./sigils.ts";

/** Every coordinate pair a row's shapes are placed at: the middle of each sign. */
const middles = (row: string): readonly (readonly [number, number])[] =>
  [...row.matchAll(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as const,
  );

describe("a row of signs", () => {
  const row = sigilRow(createRandom(90), LINE);

  it("is the same row from the same seed, and another from another", () => {
    expect(sigilRow(createRandom(90), LINE)).toBe(row);
    expect(sigilRow(createRandom(91), LINE)).not.toBe(row);
  });

  it("fills the row with large signs: about one and a half of its height to each", () => {
    const tall = LINE.bottom - LINE.top;
    const wide = LINE.right - LINE.left;

    expect(middles(row)).toHaveLength(Math.round(wide / (tall * 1.5)));
  });

  it("keeps every sign on the line and inside the row's ends", () => {
    const middle = (LINE.top + LINE.bottom) / 2;
    const tall = LINE.bottom - LINE.top;

    for (const [x, y] of middles(row)) {
      expect(x).toBeGreaterThan(LINE.left);
      expect(x).toBeLessThan(LINE.right);
      expect(Math.abs(y - middle)).toBeLessThan(tall * 0.05);
    }
  });

  it("draws each stroke as a filled shape, so a pen's swelling shows", () => {
    expect(row).toMatch(/<path d="M[-\d. L]+Z"\/>/);
    expect(row).not.toContain("stroke-width");
    expect(isWellFormed(`<svg>${row}</svg>`)).toBe(true);
  });

  it("never writes the same sign twice running", () => {
    // A hand that would always pick the first sign, at one size and turn.
    const stuck = {
      next: () => 0,
      between: (low: number) => low,
      pick: <T>(list: readonly [T, ...T[]]): T => list[0],
    };

    const shapes = sigilRow(stuck, LINE)
      .split('<g transform="translate(')
      .slice(1)
      // A sign's shape, whatever its place, without the point after it.
      .map((sign) => sign.replace(/^[^>]+>/, "").replace(/<\/g>.*$/, ""));

    expect(shapes.length).toBeGreaterThan(3);
    shapes.forEach((shape, i) => {
      if (i > 0) expect(shape).not.toBe(shapes[i - 1]);
    });
    expect(shapes[2]).toBe(shapes[0]);
  });

  it("has enough signs to choose from that rows differ", () => {
    expect(SIGIL_COUNT).toBeGreaterThanOrEqual(16);
  });
});
