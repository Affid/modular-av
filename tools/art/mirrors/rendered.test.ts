import { describe, expect, it } from "vitest";
import { expectedSize, POSES, renderedNames, SCENES } from "./rendered.ts";

describe("the mirrors theme's rendered pictures", () => {
  it("come from twelve scenes", () => {
    expect(SCENES.map((scene) => scene.script)).toEqual([
      "glass.py",
      "silver.py",
      "hands.py",
      "light.py",
      "gem.py",
      "sigils.py",
      "fog.py",
      "crack.py",
      "offpane.py",
      "pane.py",
      "contract.py",
      "quill.py",
    ]);
  });

  it("are WebP files: the glass, its silver, two poses of hands each with its light at rest and speaking, and the rest", () => {
    expect([...renderedNames()].sort()).toEqual(
      [
        "glass.webp",
        "dockframe.webp",
        "transom-h.webp",
        "transom-v.webp",
        "btn.webp",
        "btn-l.webp",
        "btn-r.webp",
        "chip.webp",
        "gem-stone.webp",
        "gem-spark.webp",
        "gem-collet.webp",
        "sigil-cut.webp",
        "sigil-mask.webp",
        "sigil-shade.webp",
        "fog.webp",
        "crack.webp",
        "offpane.webp",
        "pane.webp",
        "contract.webp",
        "quill.webp",
        ...POSES.flatMap((k) =>
          ["hands", "light-rest", "light-speak"].map(
            (kind) => `${kind}-${String(k)}.webp`,
          ),
        ),
      ].sort(),
    );
  });

  it("have the size the measures give each", () => {
    expect(expectedSize("glass.webp")).toEqual({ width: 600, height: 600 });
    expect(expectedSize("dockframe.webp")).toEqual({ width: 480, height: 480 });
    expect(expectedSize("transom-h.webp")).toEqual({ width: 2400, height: 40 });
    expect(expectedSize("transom-v.webp")).toEqual({ width: 40, height: 2400 });
    expect(expectedSize("btn.webp")).toEqual({ width: 64, height: 64 });
    expect(expectedSize("btn-r.webp")).toEqual({ width: 40, height: 64 });
    expect(expectedSize("chip.webp")).toEqual({ width: 48, height: 48 });
    expect(expectedSize("gem-stone.webp")).toEqual({ width: 48, height: 48 });
    expect(expectedSize("offpane.webp")).toEqual({ width: 480, height: 270 });
    expect(expectedSize("sigil-mask.webp")).toEqual({
      width: 1040,
      height: 110,
    });
    expect(expectedSize("contract.webp")).toEqual({ width: 600, height: 520 });
    // What lies over the frame layer has three quarters of a pixel to a tile unit.
    expect(expectedSize("hands-2.webp")).toEqual({ width: 855, height: 564 });
    expect(expectedSize("fog.webp")).toEqual({ width: 855, height: 564 });
    expect(expectedSize("crack.webp")).toEqual({ width: 855, height: 564 });
    // A light without edges needs fewer.
    expect(expectedSize("light-speak-1.webp")).toEqual({
      width: 456,
      height: 301,
    });
    expect(expectedSize("pane.webp")).toEqual({ width: 570, height: 376 });
    expect(() => expectedSize("ghost.webp")).toThrow(/ghost\.webp/);
  });
});
