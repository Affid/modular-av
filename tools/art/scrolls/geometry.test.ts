import { describe, expect, it } from "vitest";
import {
  grown,
  HALO,
  LINE,
  PICTURES,
  REACH,
  rendered,
  STONES,
  TILE,
  VIEW,
} from "./geometry.ts";

describe("the scrolls theme's measures", () => {
  it("draws a tile 1000 units wide, 16 to 9", () => {
    expect(TILE).toEqual({ width: 1000, height: 562.5 });
  });

  it("makes the frame layer the tile and its reach on every side", () => {
    expect(VIEW).toEqual({ left: -75, top: -50, right: 1075, bottom: 732.5 });
    expect(REACH.bottom).toBeGreaterThan(REACH.top);
  });

  it("keeps the row of signs on the sheet under the picture, inside the frame layer", () => {
    expect(LINE.top).toBeGreaterThan(TILE.height);
    expect(LINE.bottom).toBeLessThan(VIEW.bottom);
    expect(LINE.left).toBeGreaterThan(0);
    expect(LINE.right).toBeLessThan(TILE.width);
  });

  it("gives the signs' glow room round the row, still inside the frame layer", () => {
    expect(HALO.top).toBeLessThan(LINE.top);
    expect(HALO.left).toBeLessThan(LINE.left);
    expect(HALO.bottom).toBeLessThanOrEqual(VIEW.bottom);
    expect(HALO.right - HALO.left).toBeGreaterThan(LINE.right - LINE.left);
  });

  it("grows a box by the same margin on every side", () => {
    expect(grown({ left: 1, top: 2, right: 3, bottom: 4 }, 10)).toEqual({
      left: -9,
      top: -8,
      right: 13,
      bottom: 14,
    });
  });

  it("lays four stones on each scroll, one on each corner of the picture and clear of its middle", () => {
    expect(STONES).toHaveLength(2);
    for (const scroll of STONES) {
      expect(scroll).toHaveLength(4);
      const corners = scroll.map(
        (stone) =>
          `${stone.x < TILE.width / 2 ? "left" : "right"} ${stone.y < TILE.height / 2 ? "top" : "bottom"}`,
      );
      expect(new Set(corners).size).toBe(4);
      for (const stone of scroll) {
        const fromSide = Math.min(stone.x, TILE.width - stone.x) + stone.radius;
        // The dock's rule: nothing in the middle 70% of the picture.
        expect(fromSide / TILE.width).toBeLessThan(0.15);
      }
    }
  });

  it("says how large each rendered picture is, laid out and as rendered", () => {
    expect(rendered(PICTURES.desk)).toEqual({ width: 1200, height: 1200 });
    expect(rendered(PICTURES.paper)).toEqual({ width: 384, height: 384 });
    expect(rendered(PICTURES.plate)).toEqual({ width: 800, height: 272 });
  });
});
