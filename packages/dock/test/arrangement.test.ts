import { describe, expect, it } from "vitest";
import {
  arrangementFor,
  freeSpot,
  NO_LAYOUTS,
  parseLayouts,
  parseSceneLayout,
  parseSpot,
  type SavedLayouts,
  sourceOf,
  type Spot,
  TILE_WIDTH,
  withoutScene,
  withPanel,
  withTile,
} from "../src/scattered/arrangement.ts";

const spot = (anchor: Spot["anchor"], dx = 0, dy = 0): Spot => ({
  anchor,
  dx,
  dy,
  width: 240,
});

describe("saved values", () => {
  it("reads a spot, keeping its width within bounds", () => {
    expect(
      parseSpot({ anchor: "top-left", dx: 8, dy: 8, width: 5000 }),
    ).toEqual({ anchor: "top-left", dx: 8, dy: 8, width: TILE_WIDTH.max });
    expect(
      parseSpot({ anchor: "top-left", dx: 8, dy: 8, width: 10 })?.width,
    ).toBe(TILE_WIDTH.min);
  });

  it.each([
    ["no object", null],
    ["no such anchor", { anchor: "middle", dx: 0, dy: 0, width: 200 }],
    [
      "an offset that isn't a number",
      { anchor: "top", dx: "8", dy: 0, width: 200 },
    ],
    ["an offset off any screen", { anchor: "top", dx: 1e9, dy: 0, width: 200 }],
    ["no width", { anchor: "top", dx: 0, dy: 0, width: Number.NaN }],
  ])("gives no spot for %s", (_name, value) => {
    expect(parseSpot(value)).toBeNull();
  });

  it("drops what is broken in saved layouts and keeps the rest", () => {
    const parsed = parseLayouts({
      own: {
        tiles: {
          p1: spot("top-left"),
          p2: { anchor: "nowhere" },
          "<img>": spot("top"),
        },
        panel: spot("bottom-left"),
      },
      scenes: { s1: { tiles: { p1: spot("right") } }, "../x": {} },
    });

    expect(parsed).toEqual({
      own: { tiles: { p1: spot("top-left") }, panel: spot("bottom-left") },
      scenes: { s1: { tiles: { p1: spot("right") }, panel: null } },
    });
  });

  it("gives the defaults for a saved value that isn't layouts", () => {
    expect(parseLayouts("broken")).toEqual(NO_LAYOUTS);
    expect(parseLayouts([1, 2])).toEqual(NO_LAYOUTS);
  });
});

describe("whose arrangement shows", () => {
  const own: SavedLayouts = {
    own: { tiles: { p1: spot("top-left"), p2: spot("top") }, panel: null },
    scenes: {},
  };
  const tavern = {
    id: "tavern",
    layout: { tiles: { p1: spot("left") }, panel: spot("top") },
  };

  it("is the player's own without a scene layout", () => {
    expect(sourceOf(own, null)).toBe("own");
    expect(sourceOf(own, { id: "x", layout: null })).toBe("own");
    expect(arrangementFor(own, null)).toEqual(own.own);
  });

  it("is the scene's where a GM saved one, the rest the player's own", () => {
    expect(sourceOf(own, tavern)).toBe("scene");
    expect(arrangementFor(own, tavern)).toEqual({
      tiles: { p1: spot("left"), p2: spot("top") },
      panel: null,
    });
  });

  it("is the player's own for the scene once they moved a tile there", () => {
    const moved = withTile(own, tavern, "p2", spot("right"));

    expect(sourceOf(moved, tavern)).toBe("own-scene");
    expect(arrangementFor(moved, tavern).tiles).toEqual({
      p1: spot("left"),
      p2: spot("right"),
    });
    // Their arrangement elsewhere didn't change.
    expect(arrangementFor(moved, null)).toEqual(own.own);
  });

  it("goes back to the scene's layout", () => {
    const moved = withTile(own, tavern, "p2", spot("right"));

    const back = withoutScene(moved, "tavern");

    expect(sourceOf(back, tavern)).toBe("scene");
    expect(back.scenes).toEqual({});
  });

  it("changes the player's own arrangement where the scene has none", () => {
    const moved = withTile(own, null, "p1", spot("bottom"));

    expect(moved.own.tiles.p1).toEqual(spot("bottom"));
    expect(own.own.tiles.p1).toEqual(spot("top-left"));
  });

  it("keeps the voice panel the player's own, on every scene", () => {
    const placed = withPanel(own, spot("right"));

    expect(arrangementFor(placed, tavern).panel).toEqual(spot("right"));
  });
});

describe("free spots", () => {
  it("takes the anchors no tile uses first, never the panel's", () => {
    const used = new Set(["top-left"] as const);

    const anchors = [0, 1, 2, 3, 4, 5].map((i) => freeSpot(i, used).anchor);

    expect(anchors).toEqual([
      "top-right",
      "bottom-right",
      "left",
      "right",
      "top",
      "bottom",
    ]);
  });

  it("stacks tiles inward once every anchor is taken", () => {
    const first = freeSpot(0, new Set());
    const again = freeSpot(7, new Set());
    const third = freeSpot(14, new Set());

    expect(first).toMatchObject({ anchor: "top-left", dx: 8, dy: 8 });
    expect(again.anchor).toBe("top-left");
    expect(again.dy).toBeGreaterThan(first.dy + 100);
    expect(third.dy).toBeGreaterThan(again.dy + 100);
    expect(freeSpot(2, new Set())).toMatchObject({
      anchor: "bottom-right",
      dx: -8,
      dy: -8,
    });
  });
});

describe("a scene's saved layout", () => {
  it("reads the JSON text a GM saved", () => {
    const text = JSON.stringify({ tiles: { p1: spot("left") } });

    expect(parseSceneLayout(text)).toEqual({
      tiles: { p1: spot("left") },
      panel: null,
    });
  });

  it.each([
    ["nothing", undefined],
    ["text that isn't JSON", "{nope"],
    ["JSON that isn't a layout", "[1,2]"],
    ["an object, not text", { tiles: {} }],
    ["text too long to be one", `"${"x".repeat(100_001)}"`],
  ])("gives no layout for %s", (_name, value) => {
    expect(parseSceneLayout(value)).toBeNull();
  });
});
