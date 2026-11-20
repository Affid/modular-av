import { describe, expect, it } from "vitest";
import { FACES, GRID_VIEW, inBox, SIDES, TILE } from "./geometry.ts";
import { drawLattice } from "./lattice.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

const lattice = drawLattice();
const WIDE = SIDES.right - SIDES.left;
const TALL = SIDES.bottom - SIDES.top;

describe("drawLattice", () => {
  it("draws the same cell every time, and another for another seed", () => {
    expect(drawLattice()).toBe(lattice);
    expect(drawLattice(8)).not.toBe(lattice);
  });

  it("is well formed, refers only to what it defines, and fills a grid tile's frame layer", () => {
    const ids = new Set(idsOf(lattice));

    expect(isWellFormed(lattice)).toBe(true);
    expect(linksOf(lattice).filter((link) => !ids.has(link))).toEqual([]);
    expect(lattice).toContain(
      `viewBox="${GRID_VIEW.left} ${GRID_VIEW.top} ${GRID_VIEW.right - GRID_VIEW.left} ${GRID_VIEW.bottom - GRID_VIEW.top}"`,
    );
  });

  it("draws each side once and its opposite as the same picture, a cell away", () => {
    expect(lattice).toContain(
      `<use href="#gl" transform="translate(${WIDE} 0)"/>`,
    );
    expect(lattice).toContain(
      `<use href="#gt" transform="translate(0 ${TALL})"/>`,
    );
    expect(lattice.match(/<g id="g[lt]">/g)).toHaveLength(2);
  });

  it("runs every branch of a side from corner to corner, so neighbours' cells join", () => {
    for (const id of ["rta", "rtb", "rtc", "rtd"]) {
      const points = pathPoints(lattice, id);
      const [first, last] = [points[0], points.at(-1)];

      expect(first).toEqual([Math.round(SIDES.left), Math.round(SIDES.top)]);
      // To the nearest unit: the paths are written whole.
      expect(Math.abs((last?.[0] ?? 0) - SIDES.right)).toBeLessThanOrEqual(0.5);
      expect(Math.abs((last?.[1] ?? 0) - SIDES.top)).toBeLessThanOrEqual(0.5);
    }
    const upright = pathPoints(lattice, "rla");
    expect(
      Math.abs((upright.at(-1)?.[1] ?? 0) - SIDES.bottom),
    ).toBeLessThanOrEqual(0.5);
  });

  it("gives no two of a side's four branches the same thickness, and shorter ones beside them", () => {
    const widths = ["rta", "rtb", "rtc", "rtd"].map(
      (id) =>
        new RegExp(
          `<use href="#${id}" stroke="#[0-9a-f]+" stroke-width="([\\d.]+)"`,
        ).exec(lattice)?.[1],
    );

    expect(new Set(widths).size).toBe(4);
    expect(idsOf(lattice).filter((id) => /^q[lt]\d$/.test(id))).toHaveLength(5);
  });

  it("keeps every branch on its side: inside the frame layer at its full thickness, off the faces, and over the video's edge", () => {
    // Half a branch's thickness, with its outline: the thickest of those
    // through the corners is 26 wide, the side branches at most 18.
    const kinds = [
      { points: pathPoints(lattice, "r"), half: 15 },
      { points: pathPoints(lattice, "q"), half: 11 },
    ];

    for (const { points, half } of kinds) {
      expect(points.length).toBeGreaterThan(40);
      // The drawn sides are the left and the top: their twins are a cell away.
      expect(
        points.filter(
          (p) => p[0] < GRID_VIEW.left + half || p[1] < GRID_VIEW.top + half,
        ),
      ).toEqual([]);
      expect(points.filter((p) => inBox(FACES, p))).toEqual([]);
      expect(
        points.filter((p) => p[0] > TILE.left + 45 && p[1] > TILE.top + 45),
      ).toEqual([]);
    }
  });

  it("binds each corner of the cell", () => {
    expect(lattice.match(/<use href="#k"/g)).toHaveLength(3);
    expect(lattice).toContain('<g id="k">');
  });

  it("stays small", () => {
    expect(lattice.length).toBeLessThan(24_000);
  });
});
