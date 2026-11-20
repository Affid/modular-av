import { describe, expect, it } from "vitest";
import {
  at,
  curve,
  FACES,
  inBox,
  inView,
  mirrorFor,
  num,
  REACH,
  TILE,
  VIEW,
  whole,
} from "./geometry.ts";

describe("the frame layer", () => {
  it("is the 16:9 tile plus the reach on every side", () => {
    const width = TILE.right - TILE.left;

    expect((TILE.bottom - TILE.top) / width).toBeCloseTo(9 / 16);
    expect(TILE.left / width).toBeCloseTo(REACH);
    expect(TILE.top / width).toBeCloseTo(REACH);
    expect(VIEW.width).toBeCloseTo(width * (1 + 2 * REACH));
    expect(VIEW.height).toBeCloseTo(TILE.bottom + TILE.top);
  });

  it("keeps faces inside the margin the dock allows a frame (15%)", () => {
    const width = TILE.right - TILE.left;
    const height = TILE.bottom - TILE.top;

    expect(FACES.left - TILE.left).toBeLessThan(width * 0.15);
    expect(TILE.right - FACES.right).toBeLessThan(width * 0.15);
    expect(FACES.top - TILE.top).toBeLessThan(height * 0.15);
    expect(TILE.bottom - FACES.bottom).toBeLessThan(height * 0.15);
  });
});

describe("inBox and inView", () => {
  it("tells a point inside a box from one on its edge or outside", () => {
    expect(inBox(FACES, [600, 400])).toBe(true);
    expect(inBox(FACES, [FACES.left, 400])).toBe(false);
    expect(inBox(FACES, [600, 20])).toBe(false);
  });

  it("keeps a padding from the picture's edges", () => {
    expect(inView([10, 10], 5)).toBe(true);
    expect(inView([4, 10], 5)).toBe(false);
    expect(inView([VIEW.width - 4, 10], 5)).toBe(false);
    expect(inView([10, VIEW.height - 4], 5)).toBe(false);
  });
});

describe("num, at and curve", () => {
  it("writes numbers to one decimal, without a trailing zero", () => {
    expect(num(3.14159)).toBe("3.1");
    expect(num(2.04)).toBe("2");
    expect(at([1.26, -0.04])).toBe("1.3 0");
  });

  it("refuses a number that isn't one, rather than draw at 0", () => {
    expect(() => num(Number.NaN)).toThrow(RangeError);
    expect(() => whole(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => at([1, Number.NaN])).toThrow(RangeError);
  });

  it("never writes a negative zero", () => {
    expect(num(-0.04)).toBe("0");
    expect(whole(-0.4)).toBe("0");
  });

  it("draws a smooth path through every point", () => {
    const d = curve([
      [0, 0],
      [60, 0],
      [120, 60],
    ]);

    expect(d).toBe("M0 0C10 0 40 -10 60 0S110 50 120 60");
  });

  it("has no path for fewer than two points", () => {
    expect(curve([[1, 1]])).toBe("");
  });
});

describe("mirrorFor", () => {
  it("leaves the top left as drawn", () => {
    const mirror = mirrorFor("tl");

    expect(mirror.point([10, 20])).toEqual([10, 20]);
    expect(mirror.angle(0.5)).toBe(0.5);
  });

  it.each([
    ["tr", [VIEW.width - 10, 20], Math.PI - 0.5],
    ["bl", [10, VIEW.height - 20], -0.5],
    ["br", [VIEW.width - 10, VIEW.height - 20], -(Math.PI - 0.5)],
  ] as const)("flips points and directions for %s", (origin, point, angle) => {
    const mirror = mirrorFor(origin);

    expect(mirror.point([10, 20])).toEqual(point);
    expect(mirror.angle(0.5)).toBeCloseTo(angle);
  });
});
