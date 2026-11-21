import { describe, expect, it } from "vitest";
import {
  FRAME,
  HIDE,
  PAINT,
  PICTURES,
  REACH,
  TALLY,
  TILE,
  VIEW,
} from "./geometry.ts";

describe("the hides theme's measures", () => {
  it("draws a tile 1000 units wide, 16 to 9", () => {
    expect(TILE).toEqual({ width: 1000, height: 562.5 });
  });

  it("makes the frame layer the tile and its reach on every side", () => {
    expect(VIEW).toEqual({ left: -80, top: -80, right: 1080, bottom: 732.5 });
    expect(REACH.bottom).toBeGreaterThan(REACH.top);
  });

  it("renders a frame picture at three quarters of a pixel to a tile unit", () => {
    expect(FRAME).toEqual({ width: 870, height: 609 });
  });

  it("keeps the poles inside the frame layer on every side", () => {
    const outer = HIDE.poleOut + HIDE.poleRadius;

    expect(outer).toBeLessThan(REACH.left * TILE.width);
    expect(outer).toBeLessThan(REACH.top * TILE.width);
    expect(HIDE.below + HIDE.poleUnder + HIDE.poleRadius).toBeLessThan(
      REACH.bottom * TILE.width,
    );
  });

  it("lets the hide cover no more of the picture than its edge", () => {
    // The dock's rule: nothing in the middle 70% of the picture.
    expect(HIDE.cover / TILE.height).toBeLessThan(0.15);
    expect(PAINT.inset).toBeLessThan(HIDE.cover);
  });

  it("keeps the row of tally marks on the hide under the picture, in its middle", () => {
    expect(TALLY.top).toBeGreaterThan(TILE.height);
    expect(TALLY.bottom).toBeLessThan(TILE.height + HIDE.below);
    expect(TILE.width - TALLY.right).toBe(TALLY.left);
  });

  it("paints two hides, each with a hand of its own", () => {
    expect(PAINT.seeds).toHaveLength(2);
    expect(new Set(PAINT.seeds).size).toBe(2);
  });

  it("gives every picture with a size of its own a whole number of pixels", () => {
    for (const picture of Object.values(PICTURES)) {
      expect(Number.isInteger(picture.width * picture.density)).toBe(true);
      expect(Number.isInteger(picture.height * picture.density)).toBe(true);
    }
  });

  it("forges three nail heads of one size, so that neighbouring buttons differ", () => {
    const heads = [PICTURES["stud-1"], PICTURES["stud-2"], PICTURES["stud-3"]];

    for (const head of heads) expect(head).toEqual(heads[0]);
    expect(PICTURES["stud-left"].height).toBe(heads[0]?.height);
  });

  it("cuts a button's iron in two where its arrow begins: two parts of one head", () => {
    expect(PICTURES["stud-left"].height).toBe(PICTURES["stud-right"].height);
    expect(PICTURES["stud-left"].density).toBe(PICTURES["stud-right"].density);
  });
});
