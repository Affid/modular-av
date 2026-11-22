import { describe, expect, it } from "vitest";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import {
  CRACK,
  FILL,
  FRAME,
  HANDS,
  LEVEL,
  LIGHT,
  NAME,
  PANE,
  PICTURES,
  REACH,
  TILE,
  VIEW,
} from "./geometry.ts";

/** The dock's rule: nothing drawn in the middle 70% of a picture. */
const MIDDLE = { left: 150, top: 84.375, right: 850, bottom: 478.125 };

describe("the mirrors theme's measures", () => {
  it("draws a tile 1000 units wide, 16 to 9", () => {
    expect(TILE).toEqual({ width: 1000, height: 562.5 });
  });

  it("reaches 70 units past the picture's top and sides and 120 under it, where the name is lettered", () => {
    expect(REACH).toEqual({ top: 0.07, right: 0.07, bottom: 0.12, left: 0.07 });
    expect(VIEW).toEqual({ left: -70, top: -70, right: 1070, bottom: 682.5 });
  });

  it("renders the hands, the fog and the crack at three quarters of a pixel to a tile unit", () => {
    expect(FRAME).toEqual({ width: 855, height: 564 });
  });

  it("renders the light in the glass and the scattered pane over the same box, coarser", () => {
    expect(LIGHT).toEqual({ width: 456, height: 301 });
    expect(PANE).toEqual({ width: 570, height: 376 });
  });

  it("letters the name under the picture, inside the reach below it", () => {
    expect(NAME.y).toBeGreaterThan(TILE.height);
    expect(NAME.y).toBeLessThan(VIEW.bottom);
    expect(NAME.y / TILE.height).toBe(1.125);
  });

  it("cuts the level's nine marks above the picture, across its middle, within the reach above it", () => {
    expect(LEVEL.marks).toBe(9);
    expect(LEVEL.top).toBeGreaterThan(VIEW.top);
    // It may lie on the picture's very edge, never within its middle.
    expect(LEVEL.bottom).toBeLessThan(MIDDLE.top);
    expect(LEVEL.left).toBe(TILE.width - LEVEL.right);
  });

  it("gives the level's marks a picture of the level box's shape", () => {
    const cut = PICTURES["sigil-cut"];

    expect(cut.width / cut.height).toBeCloseTo(
      widthOf(LEVEL) / heightOf(LEVEL),
      0,
    );
    expect(PICTURES["sigil-mask"]).toEqual(cut);
    expect(PICTURES["sigil-shade"]).toEqual(cut);
  });

  it("holds every camera with two hands, one gripping and one clawing, and the other pose the other way round", () => {
    const { poses } = HANDS;

    expect(Object.keys(poses)).toEqual(["1", "2"]);
    for (const pose of Object.values(poses)) {
      expect(new Set([pose.left.hold, pose.right.hold])).toEqual(
        new Set(["grip", "claw"]),
      );
      // Clear of the name below and of the level above.
      for (const hand of [pose.left, pose.right]) {
        expect(hand.y).toBeGreaterThan(0);
        expect(hand.y).toBeLessThan(TILE.height);
      }
    }
    expect(poses["1"].left.hold).not.toBe(poses["2"].left.hold);
  });

  it("strikes the blow past the picture's upper right corner, inside the frame layer and below the level", () => {
    expect(CRACK.blow.x).toBeGreaterThan(TILE.width);
    expect(CRACK.blow.x).toBeLessThan(CRACK.right);
    expect(CRACK.right).toBeLessThan(VIEW.right);
    expect(CRACK.top).toBeGreaterThan(LEVEL.top);
    expect(CRACK.bottom).toBeLessThan(VIEW.bottom);
  });

  it("raises the contract first, the quill later, and both whole before the pictures' height", () => {
    const { height } = PICTURES.contract;

    expect(FILL.contractFrom).toBeLessThan(FILL.quillFrom);
    expect(FILL.quillFrom).toBeLessThan(FILL.wholeFrom);
    expect(FILL.wholeFrom).toBe(height);
    // How far below the glass's foot the pictures sink, at the least room they show in.
    expect(
      (FILL.wholeFrom - FILL.contractFrom) * FILL.sink,
    ).toBeLessThanOrEqual(FILL.deepest);
    expect(PICTURES.quill).toEqual(PICTURES.contract);
  });

  it("gives every picture with a size of its own a whole number of pixels", () => {
    for (const picture of Object.values(PICTURES)) {
      expect(Number.isInteger(picture.width * picture.density)).toBe(true);
      expect(Number.isInteger(picture.height * picture.density)).toBe(true);
    }
  });

  it("cuts the frame and the chips in nine on whole pixels", () => {
    const { dockframe, chip } = PICTURES;

    expect(Number.isInteger(dockframe.edge * dockframe.density)).toBe(true);
    expect(chip.slice).toBeLessThan(chip.width * chip.density);
  });

  it("makes a button and its arrow one bezel in two parts, as tall as a button, the arrow's part wider than half a button so its chevron is clear of the silver", () => {
    expect(PICTURES["btn-l"]).toEqual(PICTURES.btn);
    expect(PICTURES["btn-r"].height).toBe(PICTURES.btn.height);
    expect(PICTURES["btn-r"].width).toBe(PICTURES.btn.width / 2 + 4);
  });

  it("repeats the glass as a square, and the transoms along their length", () => {
    expect(PICTURES.glass.width).toBe(PICTURES.glass.height);
    expect(PICTURES["transom-h"].width).toBe(PICTURES["transom-v"].height);
    expect(PICTURES["transom-h"].height).toBe(PICTURES.dockframe.edge);
  });
});
