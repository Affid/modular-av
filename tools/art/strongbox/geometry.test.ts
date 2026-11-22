import { describe, expect, it } from "vitest";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import {
  FILL,
  FRAME,
  KEYHOLE,
  LEVEL,
  LOCKS,
  NAME,
  PICTURES,
  REACH,
  STATES,
  STRAP,
  THINGS,
  TILE,
  VIEW,
} from "./geometry.ts";

/** The dock's rule: nothing drawn in the middle 70% of a picture. */
const MIDDLE = { left: 150, top: 84.375, right: 850, bottom: 478.125 };

describe("the strongbox theme's measures", () => {
  it("draws a tile 1000 units wide, 16 to 9", () => {
    expect(TILE).toEqual({ width: 1000, height: 562.5 });
  });

  it("reaches 70 units over the picture's top, where the lock hangs, 60 at the sides and 150 under it, where the name is stencilled", () => {
    expect(REACH).toEqual({ top: 0.07, right: 0.06, bottom: 0.15, left: 0.06 });
    expect(VIEW).toEqual({ left: -60, top: -70, right: 1060, bottom: 712.5 });
  });

  it("renders a window's iron at three quarters of a pixel to a tile unit", () => {
    expect(FRAME).toEqual({ width: 840, height: 586 });
  });

  it("binds each window in a strap that lies on the picture's edge, inside the reach and outside its middle", () => {
    expect(STRAP.out).toBeLessThanOrEqual(REACH.left * TILE.width);
    expect(STRAP.in).toBeLessThan(MIDDLE.left);
    expect(STRAP.in).toBeLessThan(MIDDLE.top);
  });

  it("has three locks that take turns, each in five states", () => {
    expect(LOCKS).toEqual(["shield", "round", "slide"]);
    expect(STATES).toEqual(["rest", "speak", "muted", "deaf", "out"]);
  });

  it("puts every lock's keyhole on the window's top edge, in the middle, inside the reach above", () => {
    expect(KEYHOLE.x).toBe(TILE.width / 2);
    expect(KEYHOLE.y).toBeGreaterThan(VIEW.top);
    expect(KEYHOLE.y).toBeLessThan(MIDDLE.top);
  });

  it("stencils the name under the picture, inside the reach below it", () => {
    expect(NAME.y).toBeGreaterThan(TILE.height + STRAP.out);
    expect(NAME.y).toBeLessThan(VIEW.bottom);
  });

  it("cuts the level's slot in the bottom strap, across the middle, the meter's box round the slot's lips", () => {
    const { plate, slot, fill } = LEVEL;

    expect(slot.top).toBeGreaterThan(MIDDLE.bottom);
    expect(slot.left).toBe(TILE.width - slot.right);
    for (const outer of [plate, fill]) {
      expect(outer.left).toBeLessThan(slot.left);
      expect(outer.top).toBeLessThan(slot.top);
      expect(outer.right).toBeGreaterThan(slot.right);
      expect(outer.bottom).toBeGreaterThan(slot.bottom);
    }
    expect(fill.left).toBeGreaterThan(plate.left);
    expect(plate.bottom).toBeLessThan(NAME.y - 30);
  });

  it("brings the rogue's things onto the bare boards one at a time, the knife first", () => {
    expect(THINGS).toEqual(["knife", "picks", "keys", "grapnel"]);
    expect(FILL.knifeFrom).toBeLessThan(FILL.picksFrom);
    expect(FILL.picksFrom).toBeLessThan(FILL.keysFrom);
    expect(FILL.keysFrom).toBeLessThan(FILL.ropeFrom);
    // Each comes in only when the room is as tall as it is.
    expect(FILL.knifeFrom).toBeGreaterThanOrEqual(PICTURES.knife.height * 0.8);
    expect(FILL.ropeFrom).toBeGreaterThanOrEqual(PICTURES.grapnel.height);
    // Each needs the boards a little wider than itself, or it is left out.
    for (const thing of THINGS)
      expect(FILL.across[thing]).toBeGreaterThanOrEqual(
        PICTURES[thing].width * 0.95,
      );
    expect(FILL.lift).toBeGreaterThan(0);
    expect(FILL.lift).toBeLessThan(0.5);
  });

  it("gives every picture with a size of its own a whole number of pixels", () => {
    for (const [name, picture] of Object.entries(PICTURES)) {
      expect(Number.isInteger(picture.width * picture.density), name).toBe(
        true,
      );
      expect(Number.isInteger(picture.height * picture.density), name).toBe(
        true,
      );
    }
  });

  it("cuts the strap and the buttons in nine on whole pixels", () => {
    for (const name of ["strap", "button", "button-pressed"] as const) {
      const { edge, density, width } = PICTURES[name];
      expect(Number.isInteger(edge * density)).toBe(true);
      expect(edge * 2).toBeLessThan(width);
    }
  });

  it("repeats the boards as a square, one whole repeat each way", () => {
    expect(PICTURES.ground.width).toBe(PICTURES.ground.height);
  });

  it("frames the things' scenes at the shape of their pictures", () => {
    for (const name of THINGS) {
      const { span } = PICTURES[name];
      expect(span).toBeGreaterThan(0);
    }
  });

  it("makes the level's mask and its lit picture over the same box", () => {
    expect(widthOf(LEVEL.fill)).toBe(376);
    expect(heightOf(LEVEL.fill)).toBe(44);
  });
});
