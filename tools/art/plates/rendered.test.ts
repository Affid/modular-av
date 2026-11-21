import { describe, expect, it } from "vitest";
import { expectedSize, PLATES, renderedNames, SCENES } from "./rendered.ts";

describe("the plates theme's rendered pictures", () => {
  it("come from eight scenes: the mail, the plates, the knife, the larger plate, the buttons, and the three things", () => {
    expect(SCENES.map((scene) => scene.script)).toEqual([
      "mail.py",
      "plate.py",
      "knife.py",
      "lame.py",
      "tab.py",
      "mace.py",
      "gauntlets.py",
      "buckler.py",
    ]);
  });

  it("are WebP files: two plates, each at rest, polished and rusted, with its cord whole and lost", () => {
    expect([...renderedNames()].sort()).toEqual(
      [
        "mail.webp",
        "knife.webp",
        "blade.webp",
        "lame.webp",
        "steel.webp",
        "tab-1.webp",
        "tab-2.webp",
        "tab-left.webp",
        "tab-right.webp",
        "mace.webp",
        "gauntlets.webp",
        "buckler.webp",
        ...PLATES.flatMap((k) =>
          ["plate", "plate-polished", "plate-out", "cord", "cord-out"].map(
            (kind) => `${kind}-${String(k)}.webp`,
          ),
        ),
      ].sort(),
    );
  });

  it("have the size the measures give each", () => {
    expect(expectedSize("mail.webp")).toEqual({ width: 600, height: 600 });
    expect(expectedSize("steel.webp")).toEqual({ width: 450, height: 450 });
    expect(expectedSize("lame.webp")).toEqual({ width: 960, height: 384 });
    // Small things are rendered no larger than a sharp screen shows them.
    expect(expectedSize("tab-1.webp")).toEqual({ width: 64, height: 64 });
    expect(expectedSize("tab-right.webp")).toEqual({ width: 32, height: 64 });
    expect(expectedSize("mace.webp")).toEqual({ width: 520, height: 168 });
    expect(expectedSize("gauntlets.webp")).toEqual({ width: 340, height: 360 });
    expect(expectedSize("buckler.webp")).toEqual({ width: 380, height: 472 });
    // What fills the frame layer has three quarters of a pixel to a tile unit.
    expect(expectedSize("plate-2.webp")).toEqual({ width: 840, height: 594 });
    expect(expectedSize("cord-out-1.webp")).toEqual({
      width: 840,
      height: 594,
    });
    expect(expectedSize("knife.webp")).toEqual({ width: 840, height: 594 });
    // The blade alone is its box, cut out of a frame picture.
    expect(expectedSize("blade.webp")).toEqual({ width: 432, height: 27 });
    expect(() => expectedSize("ghost.webp")).toThrow(/ghost\.webp/);
  });
});
