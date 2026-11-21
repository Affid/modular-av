import { describe, expect, it } from "vitest";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import {
  FRAME,
  KNIFE,
  LEVEL,
  PICTURES,
  PLATE,
  REACH,
  THINGS,
  TILE,
  VIEW,
} from "./geometry.ts";

describe("the plates theme's measures", () => {
  it("draws a tile 1000 units wide, 16 to 9", () => {
    expect(TILE).toEqual({ width: 1000, height: 562.5 });
  });

  it("makes the frame layer the tile and its reach on every side", () => {
    expect(VIEW).toEqual({ left: -60, top: -60, right: 1060, bottom: 732.5 });
    expect(REACH.bottom).toBeGreaterThan(REACH.top);
  });

  it("renders a frame picture at three quarters of a pixel to a tile unit", () => {
    expect(FRAME).toEqual({ width: 840, height: 594 });
  });

  it("keeps the plate, its cord and room for its shadow inside the frame layer", () => {
    const outer = PLATE.out + PLATE.cordOut;

    expect(outer).toBeLessThan(REACH.left * TILE.width);
    expect(outer).toBeLessThan(REACH.top * TILE.width);
    expect(PLATE.below + PLATE.cordOut).toBeLessThan(REACH.bottom * TILE.width);
  });

  it("lets the plate cover no more of the picture than its edge", () => {
    // The dock's rule: nothing in the middle 70% of the picture.
    expect(PLATE.cover / TILE.height).toBeLessThan(0.15);
  });

  it("runs the rib round the picture between it and the rolled edge", () => {
    expect(PLATE.ribAt - PLATE.ribHalf).toBeGreaterThan(0);
    expect(PLATE.ribAt + PLATE.ribHalf).toBeLessThan(
      PLATE.out - 2 * PLATE.bead,
    );
  });

  it("forges two plates, each with dents and rust of its own", () => {
    expect(PLATE.seeds).toHaveLength(2);
    expect(new Set(PLATE.seeds).size).toBe(2);
  });

  it("lays the knife in the black band under the picture, clear of the rib and of the rolled edge", () => {
    const band = {
      top: TILE.height + PLATE.ribAt + PLATE.ribHalf,
      bottom: TILE.height + PLATE.below - 2 * PLATE.bead,
    };

    expect(KNIFE.y - KNIFE.half).toBeGreaterThan(band.top);
    expect(KNIFE.y + KNIFE.half).toBeLessThan(band.bottom);
    expect(KNIFE.pommel).toBeLessThan(KNIFE.gripFrom);
    expect(KNIFE.gripTo).toBeLessThan(KNIFE.guard);
    expect(KNIFE.guard).toBeLessThan(KNIFE.tip);
  });

  it("makes the level's box the blade: from the guard to past the point, the knife's middle in its own", () => {
    expect(LEVEL.left).toBeGreaterThan(KNIFE.guard);
    expect(LEVEL.right).toBeGreaterThan(KNIFE.tip);
    expect((LEVEL.top + LEVEL.bottom) / 2).toBe(KNIFE.y);
    expect(heightOf(LEVEL)).toBeGreaterThan(2 * KNIFE.half);
  });

  it("cuts the level's box on whole pixels of a frame picture, so the blade's mask meets the knife under it", () => {
    const density = FRAME.width / widthOf(VIEW);

    for (const edge of [LEVEL.left - VIEW.left, LEVEL.right - VIEW.left])
      expect(Number.isInteger(edge * density)).toBe(true);
    for (const edge of [LEVEL.top - VIEW.top, LEVEL.bottom - VIEW.top])
      expect(Number.isInteger(edge * density)).toBe(true);
  });

  it("gives every picture with a size of its own a whole number of pixels", () => {
    for (const picture of Object.values(PICTURES)) {
      expect(Number.isInteger(picture.width * picture.density)).toBe(true);
      expect(Number.isInteger(picture.height * picture.density)).toBe(true);
    }
  });

  it("repeats the mail and the steel as squares, a whole number of rings to the mail's repeat", () => {
    expect(PICTURES.mail.width).toBe(PICTURES.mail.height);
    expect(PICTURES.steel.width).toBe(PICTURES.steel.height);
    expect(Number.isInteger(PICTURES.mail.across)).toBe(true);
  });

  it("makes two buttons' plates of one size, so that neighbours differ, and one longer plate in two parts", () => {
    expect(PICTURES["tab-1"]).toEqual(PICTURES["tab-2"]);
    expect(PICTURES["tab-left"].height).toBe(PICTURES["tab-right"].height);
    expect(PICTURES["tab-left"].density).toBe(PICTURES["tab-right"].density);
    expect(PICTURES["tab-right"].width * 2).toBe(PICTURES["tab-left"].width);
  });

  it("has three things for the free room, each taller than the one before", () => {
    expect(THINGS).toEqual(["mace", "gauntlets", "buckler"]);
    const heights = THINGS.map((name) => PICTURES[name].height);

    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    // None is wider than the narrowest dock's list of cameras.
    for (const name of THINGS) expect(PICTURES[name].width).toBeLessThan(280);
  });
});
