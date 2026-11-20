import { describe, expect, it } from "vitest";
import { LEAF_SHAPES, leafDefs, leafOutline } from "./leaves.ts";
import { idsOf, linksOf } from "./svg.ts";

describe("leafOutline", () => {
  it.each(LEAF_SHAPES)(
    "closes %s from the stalk round to the stalk",
    (shape) => {
      const d = leafOutline(shape);

      expect(d.startsWith("M0 0C")).toBe(true);
      expect(d.endsWith(" 0 0Z")).toBe(true);
      expect(d).toContain("100 0C");
      expect(d).not.toMatch(/NaN|undefined/);
    },
  );

  it("mirrors the upper half below the midrib, a little narrower", () => {
    const d = leafOutline("young");

    // Up: C6 -10 18 -24 40 -24 C64 -22 86 -8 100 0; then back, below.
    expect(d).toBe(
      "M0 0C6 -10 18 -24 40 -24C64 -22 86 -8 100 0C86 7.5 64 20.7 40 22.6C18 22.6 6 9.4 0 0Z",
    );
  });
});

describe("leafDefs", () => {
  const defs = leafDefs();

  it("defines each shape and its shadow", () => {
    const ids = idsOf(defs);

    for (const shape of LEAF_SHAPES) {
      expect(ids).toContain(shape);
      expect(ids).toContain(`${shape}-s`);
    }
  });

  it("refers only to its own shading", () => {
    const ids = new Set(idsOf(defs));

    expect(linksOf(defs).filter((link) => !ids.has(link))).toEqual([]);
  });

  it("leaves a leaf's colour to whoever uses it", () => {
    // The first shape of each leaf has no fill of its own.
    for (const shape of LEAF_SHAPES)
      expect(defs).toMatch(new RegExp(`<g id="${shape}"><path d="[^"]+"/>`));
  });
});
