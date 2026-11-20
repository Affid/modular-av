import { describe, expect, it } from "vitest";
import { inBox, TILE } from "./geometry.ts";
import { CORNERS, LOOP_INSET, loopSpot, PERIMETER, wrapped } from "./loop.ts";

const steps = Array.from({ length: 600 }, (_, i) => (PERIMETER * i) / 600);

describe("loopSpot", () => {
  it("starts on the top side, heading right, with up as the way out", () => {
    const [start, next] = [loopSpot(0), loopSpot(10)];

    expect(start.at[1]).toBeCloseTo(TILE.top + LOOP_INSET);
    expect(next.at[0] - start.at[0]).toBeCloseTo(10);
    expect(start.out).toEqual([0, -1]);
  });

  it("goes round without a jump, and comes back to where it started", () => {
    const jumps = steps.map((s) => {
      const [a, b] = [loopSpot(s).at, loopSpot(s + PERIMETER / 600).at];
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    });

    expect(Math.max(...jumps)).toBeLessThan((PERIMETER / 600) * 1.01);
    expect(loopSpot(PERIMETER).at[0]).toBeCloseTo(loopSpot(0).at[0]);
    expect(loopSpot(-25).at).toEqual(loopSpot(PERIMETER - 25).at);
  });

  it("stays just inside the video, the way out always a unit vector", () => {
    for (const s of steps) {
      const { at, out } = loopSpot(s);

      expect(inBox(TILE, at)).toBe(true);
      expect(Math.hypot(out[0], out[1])).toBeCloseTo(1);
    }
  });

  it("is halfway round each corner where it says", () => {
    const turned = (s: number): number =>
      Math.abs(loopSpot(s).out[0] * loopSpot(s).out[1]);

    for (const s of Object.values(CORNERS)) expect(turned(s)).toBeCloseTo(0.5);
    expect(loopSpot(CORNERS.bottomRight).out[0]).toBeGreaterThan(0);
    expect(loopSpot(CORNERS.bottomRight).out[1]).toBeGreaterThan(0);
  });
});

describe("wrapped", () => {
  it("brings any distance into one turn", () => {
    expect(wrapped(PERIMETER + 5)).toBeCloseTo(5);
    expect(wrapped(-5)).toBeCloseTo(PERIMETER - 5);
  });
});
