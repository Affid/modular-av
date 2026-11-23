import { describe, expect, it } from "vitest";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import {
  FILL,
  FRAME,
  METER,
  READOUT,
  REACH,
  STATES,
  TILE,
  VIEW,
} from "./geometry.ts";

/** The dock's rule: nothing drawn in the middle 70% of a picture. */
const MIDDLE = { left: 150, top: 84.375, right: 850, bottom: 478.125 };

describe("the spaceship theme's measures", () => {
  it("draws a tile 1000 units wide, 16 to 9", () => {
    expect(TILE).toEqual({ width: 1000, height: 562.5 });
  });

  it("reaches 60 units over the picture, 65 at its sides and 170 under it, where the chin holds the readout", () => {
    expect(REACH).toEqual({
      top: 0.06,
      right: 0.065,
      bottom: 0.17,
      left: 0.065,
    });
    expect(VIEW).toEqual({ left: -65, top: -60, right: 1065, bottom: 732.5 });
  });

  it("renders a monitor at three quarters of a pixel to a tile unit", () => {
    expect(FRAME).toEqual({ width: 848, height: 594 });
  });

  it("shows a monitor at rest, speaking, muted, deafened, and muted and deafened", () => {
    expect(STATES).toEqual(["rest", "speak", "muted", "deaf", "mdeaf"]);
  });

  it("sets the readout in the chin, under the picture and inside the reach, its window inside its bezel", () => {
    const { outer, window } = READOUT;

    expect(outer.top).toBeGreaterThan(TILE.height);
    expect(outer.bottom).toBeLessThan(VIEW.bottom);
    expect(window.left).toBeGreaterThan(outer.left);
    expect(window.right).toBeLessThan(outer.right);
    expect(window.top).toBeGreaterThan(outer.top);
    expect(window.bottom).toBeLessThan(outer.bottom);
    // Centred under the picture.
    expect(window.left).toBe(TILE.width - window.right);
    expect(widthOf(window)).toBe(780);
    expect(heightOf(window)).toBe(88);
  });

  it("puts your level's window in the case's right side, beside the picture, clear of its middle", () => {
    expect(METER.x - METER.across / 2).toBeGreaterThan(TILE.width);
    expect(METER.x + METER.across / 2).toBeLessThan(VIEW.right);
    expect(METER.top).toBeGreaterThanOrEqual(0);
    expect(METER.bottom).toBeLessThanOrEqual(TILE.height);
    expect(METER.x).toBeGreaterThan(MIDDLE.right);
  });

  it("brings the wall's things in as the room grows, the smallest first", () => {
    const from = [
      FILL.tapeFrom,
      FILL.wrenchFrom,
      FILL.clipboardFrom,
      FILL.extinguisherFrom,
    ];

    expect(from).toEqual([...from].sort((a, b) => a - b));
    expect(new Set(from).size).toBe(from.length);
  });
});
