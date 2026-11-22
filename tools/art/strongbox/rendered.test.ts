import { describe, expect, it } from "vitest";
import { LOCKS, STATES } from "./geometry.ts";
import { expectedSize, renderedNames, SCENES } from "./rendered.ts";

describe("the strongbox theme's rendered pictures", () => {
  it("come from seven scenes: the boards, the strap, the windows, the level, the small parts, the lining and the things", () => {
    expect(SCENES.map((scene) => scene.script)).toEqual([
      "ground.py",
      "strap.py",
      "frames.py",
      "level.py",
      "parts.py",
      "lining.py",
      "things.py",
    ]);
  });

  it("are WebP files: each lock in each state, and the rest", () => {
    expect([...renderedNames()].sort()).toEqual(
      [
        "ground.webp",
        "strap.webp",
        "level.webp",
        "level-mask.webp",
        "level-fill.webp",
        "button.webp",
        "button-pressed.webp",
        "padlock.webp",
        "bracket-tl.webp",
        "bracket-tr.webp",
        "bracket-bl.webp",
        "bracket-br.webp",
        "wear.webp",
        "lining.webp",
        "knife.webp",
        "picks.webp",
        "keys.webp",
        "grapnel.webp",
        ...LOCKS.flatMap((lock) =>
          STATES.map((state) => `frame-${lock}-${state}.webp`),
        ),
      ].sort(),
    );
    expect(renderedNames()).toHaveLength(33);
  });

  it("have the size the measures give each", () => {
    expect(expectedSize("ground.webp")).toEqual({ width: 1200, height: 1200 });
    expect(expectedSize("strap.webp")).toEqual({ width: 160, height: 160 });
    expect(expectedSize("button.webp")).toEqual({ width: 64, height: 64 });
    expect(expectedSize("padlock.webp")).toEqual({ width: 48, height: 68 });
    expect(expectedSize("bracket-br.webp")).toEqual({ width: 60, height: 60 });
    expect(expectedSize("wear.webp")).toEqual({ width: 320, height: 80 });
    expect(expectedSize("lining.webp")).toEqual({ width: 560, height: 315 });
    expect(expectedSize("knife.webp")).toEqual({ width: 390, height: 234 });
    expect(expectedSize("picks.webp")).toEqual({ width: 168, height: 282 });
    expect(expectedSize("keys.webp")).toEqual({ width: 234, height: 312 });
    expect(expectedSize("grapnel.webp")).toEqual({ width: 286, height: 546 });
    // What fills the frame layer has three quarters of a pixel to a tile unit.
    expect(expectedSize("frame-slide-out.webp")).toEqual({
      width: 840,
      height: 586,
    });
    expect(expectedSize("level.webp")).toEqual({ width: 840, height: 586 });
    // The lit slot at the frame's density; its mask at a pixel to a unit.
    expect(expectedSize("level-fill.webp")).toEqual({ width: 282, height: 33 });
    expect(expectedSize("level-mask.webp")).toEqual({ width: 376, height: 44 });
    expect(() => expectedSize("ghost.webp")).toThrow(/ghost\.webp/);
  });
});
