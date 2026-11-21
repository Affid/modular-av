import { describe, expect, it } from "vitest";
import { expectedSize, renderedNames, SCENES } from "./rendered.ts";

describe("the hides theme's rendered pictures", () => {
  it("come from six scenes: the wall, the hides, the name's tag, the nailed piece, the nail heads and the skull", () => {
    expect(SCENES.map((scene) => scene.script)).toEqual([
      "wall.py",
      "hide.py",
      "tag.py",
      "piece.py",
      "stud.py",
      "skull.py",
    ]);
  });

  it("are WebP files: two hides, and for each its cut thongs, where light shows through it and its paint; three nail heads, so that neighbours differ", () => {
    expect([...renderedNames()].sort()).toEqual(
      [
        "wall.webp",
        "tag.webp",
        "piece.webp",
        "leather.webp",
        "stud-1.webp",
        "stud-2.webp",
        "stud-3.webp",
        "stud-left.webp",
        "stud-right.webp",
        "skull.webp",
        ...[1, 2].flatMap((k) =>
          ["hide", "hide-cut", "light", "paint"].map(
            (kind) => `${kind}-${String(k)}.webp`,
          ),
        ),
      ].sort(),
    );
  });

  it("have the size the measures give each", () => {
    expect(expectedSize("wall.webp")).toEqual({ width: 1200, height: 1200 });
    expect(expectedSize("piece.webp")).toEqual({ width: 480, height: 192 });
    expect(expectedSize("stud-right.webp")).toEqual({ width: 48, height: 96 });
    // Small things are rendered no larger than a sharp screen shows them.
    expect(expectedSize("tag.webp")).toEqual({ width: 400, height: 136 });
    expect(expectedSize("leather.webp")).toEqual({ width: 450, height: 450 });
    expect(expectedSize("skull.webp")).toEqual({ width: 720, height: 480 });
    // What fills the frame layer has three quarters of a pixel to a tile unit.
    expect(expectedSize("hide-2.webp")).toEqual({ width: 870, height: 609 });
    expect(expectedSize("paint-1.webp")).toEqual({ width: 870, height: 609 });
    expect(() => expectedSize("ghost.webp")).toThrow(/ghost\.webp/);
  });
});
