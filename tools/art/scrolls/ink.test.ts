import { describe, expect, it } from "vitest";
import { idsOf, isWellFormed, linksOf, pathPoints } from "../vines/svg.ts";
import { HALO, LINE, TILE, VIEW } from "./geometry.ts";
import { drawWriting, WRITINGS } from "./ink.ts";

const viewBoxOf = (svg: string): string =>
  /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "";
const boxOf = (box: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): string =>
  `${box.left} ${box.top} ${box.right - box.left} ${box.bottom - box.top}`;

describe("what is written on a scroll", () => {
  const writings = Array.from({ length: WRITINGS }, (_, k) => drawWriting(k));

  it("comes in four hands, no two alike", () => {
    expect(WRITINGS).toBe(4);
    for (const part of ["ink", "signs", "halo"] as const)
      expect(new Set(writings.map((w) => w[part])).size).toBe(4);
  });

  it("is the same every time", () => {
    expect(drawWriting(2)).toEqual(writings[2]);
  });

  it("rules the picture's edge in ink and gold leaf, over the whole frame layer", () => {
    for (const { ink } of writings) {
      expect(viewBoxOf(ink)).toBe(boxOf(VIEW));
      expect(isWellFormed(ink)).toBe(true);
      expect(pathPoints(ink, "gold").length).toBeGreaterThanOrEqual(8);
      expect(pathPoints(ink, "rule").length).toBeGreaterThanOrEqual(16);
    }
  });

  it("keeps every ruled line at the picture's edge: nothing over a face", () => {
    /** How far a point is from the nearest edge of the picture, inside or outside it. */
    const fromEdge = ([x, y]: readonly [number, number]): number =>
      Math.min(
        Math.abs(x),
        Math.abs(TILE.width - x),
        Math.abs(y),
        Math.abs(TILE.height - y),
      );

    for (const { ink } of writings)
      for (const point of [
        ...pathPoints(ink, "gold"),
        ...pathPoints(ink, "rule"),
      ])
        expect(fromEdge(point)).toBeLessThan(16);
  });

  it("writes the row of signs in the same ink, sunk a little into the vellum", () => {
    for (const { ink, signs } of writings) {
      const shapes = /<g fill="#fff">(.+)<\/g>/.exec(signs)?.[1] ?? "none";

      // Drawn once, and laid twice: the soft spread round each stroke, and the stroke.
      expect(ink.split(shapes)).toHaveLength(2);
      expect(ink.split('<use href="#signs"')).toHaveLength(3);
      expect(idsOf(ink)).toContain("signs");
    }
  });

  it("gives the signs alone as a mask the size of their row: the level fills it", () => {
    for (const { signs } of writings) {
      expect(viewBoxOf(signs)).toBe(boxOf(LINE));
      expect(isWellFormed(signs)).toBe(true);
      expect(signs).not.toContain("filter");
    }
  });

  it("gives their glow as a mask with room to fade out in", () => {
    for (const { halo } of writings) {
      expect(viewBoxOf(halo)).toBe(boxOf(HALO));
      expect(isWellFormed(halo)).toBe(true);
      expect(linksOf(halo)).toEqual(idsOf(halo));
      // The blur's region is the whole picture, not the signs' own box.
      expect(halo).toContain(
        `filterUnits="userSpaceOnUse" x="${HALO.left}" y="${HALO.top}" width="${HALO.right - HALO.left}" height="${HALO.bottom - HALO.top}"`,
      );
    }
  });
});
