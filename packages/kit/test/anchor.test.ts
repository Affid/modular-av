import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  anchorOf,
  avoid,
  isAnchor,
  placeAnchored,
} from "../src/anchor.ts";

const SCREEN = { width: 1200, height: 800 };
const TILE = { width: 200, height: 100 };

describe("placeAnchored", () => {
  it("puts the box's matching point at the window's, plus the offset", () => {
    expect(
      placeAnchored({ anchor: "top-left", dx: 10, dy: 20 }, TILE, SCREEN),
    ).toEqual({ left: 10, top: 20, ...TILE });
    expect(
      placeAnchored({ anchor: "bottom-right", dx: -10, dy: -20 }, TILE, SCREEN),
    ).toEqual({ left: 990, top: 680, ...TILE });
    expect(
      placeAnchored({ anchor: "top", dx: 0, dy: 8 }, TILE, SCREEN),
    ).toEqual({ left: 500, top: 8, ...TILE });
    expect(
      placeAnchored({ anchor: "right", dx: -8, dy: 0 }, TILE, SCREEN),
    ).toEqual({ left: 992, top: 350, ...TILE });
  });

  it("keeps a box against its corner when the window is resized", () => {
    const where = { anchor: "bottom-right", dx: -10, dy: -10 } as const;

    const small = placeAnchored(where, TILE, { width: 800, height: 600 });

    expect([small.left + small.width, small.top + small.height]).toEqual([
      790, 590,
    ]);
  });
});

describe("anchorOf", () => {
  it("picks the anchor of the third the centre is in, keeping the box in place", () => {
    const rect = { left: 1000, top: 40, ...TILE };

    const where = anchorOf(rect, SCREEN);

    expect(where).toEqual({ anchor: "top-right", dx: 0, dy: 40 });
    expect(placeAnchored(where, TILE, SCREEN)).toEqual(rect);
  });

  it("anchors every third of the window, the middle to the nearer edge", () => {
    const at = (x: number, y: number) =>
      anchorOf({ left: x - 100, top: y - 50, ...TILE }, SCREEN).anchor;

    expect([at(100, 100), at(600, 100), at(1100, 100)]).toEqual([
      "top-left",
      "top",
      "top-right",
    ]);
    expect([at(100, 400), at(1100, 400)]).toEqual(["left", "right"]);
    expect([at(600, 390), at(600, 410)]).toEqual(["top", "bottom"]);
    expect([at(100, 700), at(600, 700), at(1100, 700)]).toEqual([
      "bottom-left",
      "bottom",
      "bottom-right",
    ]);
  });

  it("round-trips every anchor", () => {
    for (const anchor of ANCHORS) {
      const rect = placeAnchored({ anchor, dx: 0, dy: 0 }, TILE, SCREEN);
      expect(placeAnchored(anchorOf(rect, SCREEN), TILE, SCREEN)).toEqual(rect);
    }
  });
});

describe("isAnchor", () => {
  it("accepts the eight anchors only", () => {
    expect(ANCHORS.every(isAnchor)).toBe(true);
    expect([isAnchor("middle"), isAnchor(3), isAnchor(null)]).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("avoid", () => {
  const sidebar = { left: 900, top: 0, width: 300, height: 800 };
  const hotbar = { left: 400, top: 740, width: 400, height: 60 };

  it("leaves a box that is clear where it is", () => {
    const rect = { left: 100, top: 100, ...TILE };

    expect(avoid(rect, [sidebar, hotbar], SCREEN)).toEqual(rect);
  });

  it("moves a box out of an obstacle the shortest way, a margin from it", () => {
    const rect = { left: 850, top: 100, ...TILE };

    expect(avoid(rect, [sidebar], SCREEN, { margin: 8 })).toEqual({
      left: 692,
      top: 100,
      ...TILE,
    });
  });

  it("keeps the box on screen", () => {
    const rect = { left: -50, top: 790, ...TILE };

    expect(avoid(rect, [], SCREEN, { margin: 8 })).toEqual({
      left: 8,
      top: 692,
      ...TILE,
    });
  });

  it("clears every obstacle at once, frame and all", () => {
    const rect = { left: 700, top: 680, ...TILE };
    const reach = { top: 10, right: 20, bottom: 10, left: 20 };

    const moved = avoid(rect, [sidebar, hotbar], SCREEN, { margin: 8, reach });

    // Up, out of the hotbar, and left of the sidebar with the frame.
    expect(moved).toEqual({ left: 672, top: 622, ...TILE });
  });

  it("stays put on screen where nothing is clear", () => {
    const wall = { left: 0, top: 0, width: 1200, height: 800 };
    const rect = { left: 100, top: 100, ...TILE };

    expect(avoid(rect, [wall], SCREEN)).toEqual(rect);
  });
});
