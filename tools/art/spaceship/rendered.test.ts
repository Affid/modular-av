import { describe, expect, it } from "vitest";
import { STATES } from "./geometry.ts";
import { expectedSize, qualityOf, renderedNames, SCENES } from "./rendered.ts";

describe("the spaceship theme's rendered pictures", () => {
  it("come from seven scenes: the bulkhead, the monitors, their screens, the plates, the lamps, the keys and the things", () => {
    expect(SCENES.map((scene) => scene.script)).toEqual([
      "wall.py",
      "frames.py",
      "screens.py",
      "plates.py",
      "lamps.py",
      "keys.py",
      "things.py",
    ]);
  });

  it("are a monitor and the viewer's own in every state, the readout's window, and the rest", () => {
    const names = renderedNames();

    for (const state of STATES) {
      expect(names).toContain(`monitor-${state}.webp`);
      expect(names).toContain(`own-${state}.webp`);
    }
    expect(names).toEqual(
      expect.arrayContaining([
        "readout-rest.webp",
        "readout-speak.webp",
        "colour-tape.webp",
        "scan.webp",
        "snow.webp",
        "bulkhead.webp",
        "key-rest.webp",
        "key-rest-hover.webp",
        "key-down-amber-hover.webp",
        "arrow-down-hover.webp",
        "extinguisher.webp",
      ]),
    );
    expect(names).toHaveLength(56);
    expect(new Set(names).size).toBe(names.length);
  });

  it("have the size the measures give each", () => {
    // What fills the frame layer has three quarters of a pixel to a tile unit.
    expect(expectedSize("monitor-rest.webp")).toEqual({
      width: 848,
      height: 594,
    });
    expect(expectedSize("scan-deaf-own.webp")).toEqual({
      width: 848,
      height: 594,
    });
    // The readout's window, at the frame's density.
    expect(expectedSize("readout-speak.webp")).toEqual({
      width: 585,
      height: 66,
    });
    expect(expectedSize("bulkhead.webp")).toEqual({
      width: 1200,
      height: 1200,
    });
    expect(expectedSize("plate.webp")).toEqual({ width: 600, height: 600 });
    // Every key shares one size, every arrow another, whatever its state.
    expect(expectedSize("key-down-green-hover.webp")).toEqual({
      width: 108,
      height: 108,
    });
    expect(expectedSize("arrow-down.webp")).toEqual({ width: 66, height: 102 });
    expect(expectedSize("extinguisher.webp")).toEqual({
      width: 338,
      height: 626,
    });
  });

  it("refuses a name no scene renders", () => {
    expect(() => expectedSize("frame-shield-rest.webp")).toThrow(
      /not a picture the scenes render/,
    );
  });
});

describe("the plates' paint", () => {
  it("is encoded finer than the rest, so its scratches don't smear", () => {
    expect(qualityOf("plate.webp")).toBe(0.97);
    expect(qualityOf("bulkhead.webp")).toBeUndefined();
  });
});
