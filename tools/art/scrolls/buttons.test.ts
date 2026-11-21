import { describe, expect, it } from "vitest";
import { idsOf, isWellFormed, linksOf } from "../vines/svg.ts";
import { drawButton } from "./buttons.ts";

describe("a button's facets", () => {
  const whole = drawButton("whole");
  const left = drawButton("left");
  const right = drawButton("right");

  it("are light and shade only, stretched over the button's own colour", () => {
    for (const picture of [whole, left, right]) {
      expect(isWellFormed(picture)).toBe(true);
      expect(picture).toContain('viewBox="0 0 100 100"');
      expect(picture).toContain('preserveAspectRatio="none"');
      expect(idsOf(picture)).toEqual(
        expect.arrayContaining([...linksOf(picture)]),
      );
      const paints = [...picture.matchAll(/(?:fill|stroke)="([^"]+)"/g)]
        .map((m) => m[1] ?? "")
        .filter((paint) => !paint.startsWith("url(") && paint !== "none");
      expect(new Set(paints)).toEqual(new Set(["#fff", "#000"]));
    }
  });

  it("differ: a whole stone, and the two parts of one a button shares with its menu arrow", () => {
    expect(new Set([whole, left, right]).size).toBe(3);
  });

  it("leave out the facet on the side where the two parts meet, so the flat top runs through", () => {
    // The whole stone's top is a square inside its four facets.
    expect(whole).toContain('<rect x="22" y="22" width="56" height="56"');
    // The left part's top runs to its right edge, the right part's from its left.
    expect(left).toContain('<rect x="22" y="22" width="78" height="56"');
    expect(right).toContain('<rect x="0" y="22" width="78" height="56"');
  });

  it("cut a line in the stone where the arrow's part begins", () => {
    expect(right).toContain('id="cut"');
    expect(left).not.toContain('id="cut"');
    expect(whole).not.toContain('id="cut"');
  });
});
