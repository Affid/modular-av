import { describe, expect, it } from "vitest";
import { type BoughSpec, drawBough } from "./bough.ts";
import { BOUGH, UNITS } from "./plant.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

const WIDE = (BOUGH.tip + BOUGH.period + BOUGH.joint) * UNITS;
const TALL = BOUGH.height * UNITS;
const TIP = BOUGH.tip * UNITS;
const MIDDLE = BOUGH.period * UNITS;
const thick: BoughSpec = {
  seed: 12,
  thick: true,
  curl: "up",
  leaves: { above: 30, below: 70 },
};
const thin: BoughSpec = { seed: 5, thick: false, curl: "down" };
const under = drawBough(thick);
const over = drawBough(thin);
const LEAF =
  /<use href="#(?:ivy5|ivy3|heart|young)" transform="translate\((-?\d+) (-?\d+)\)/g;
/** A path's own points, without the handles between them. */
const onPath = (
  svg: string,
  id: string,
): readonly (readonly [number, number])[] =>
  pathPoints(svg, id).filter((_, i) => i === 0 || (i >= 3 && i % 2 === 1));
const strandWidth = (svg: string, id: string): number =>
  Number(
    new RegExp(
      `<use href="#${id}" stroke="#[0-9a-f]+" stroke-width="([\\d.]+)"`,
    ).exec(svg)?.[1],
  );

describe("drawBough", () => {
  it("draws the same bough every time, and another for another seed", () => {
    expect(drawBough(thick)).toBe(under);
    expect(drawBough({ ...thick, seed: 13 })).not.toBe(under);
  });

  it("is well formed and refers only to what it defines", () => {
    for (const svg of [under, over]) {
      const ids = new Set(idsOf(svg));

      expect(isWellFormed(svg)).toBe(true);
      expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it("has a size of its own, a tip, one period and a joint long, for a stylesheet to slice by", () => {
    const wide = BOUGH.tip + BOUGH.period + BOUGH.joint;

    expect(under).toContain(
      `width="${String(wide)}" height="${String(BOUGH.height)}" viewBox="0 0 ${String(WIDE)} ${String(TALL)}"`,
    );
  });

  it("starts under the trunk at its right end, and every strand runs through the middle", () => {
    for (const id of ["ba", "bb", "bc", "bd"]) {
      const xs = onPath(under, id).map((p) => p[0]);

      expect(Math.max(...xs)).toBeGreaterThan(WIDE - 110);
      expect(Math.min(...xs)).toBeLessThan(TIP - 20);
    }
    expect(Math.max(...onPath(under, "ba").map((p) => p[0]))).toBeGreaterThan(
      WIDE,
    );
  });

  it("repeats its middle without a seam: where the middle ends, every strand is as where it starts", () => {
    for (const id of ["ba", "bb", "bc", "bd"]) {
      const points = onPath(under, id);
      const atJoint = points.findIndex((p) => p[0] === TIP + MIDDLE);
      const atTip = points.findIndex((p) => p[0] === TIP);

      expect(atJoint).toBeGreaterThan(0);
      expect(atTip).toBeGreaterThan(atJoint);
      // Two points to either side as well: the curve through a point bends by its neighbours.
      for (const k of [-2, -1, 0, 1, 2]) {
        const [first, again] = [points[atJoint + k], points[atTip + k]];
        expect(first && again).toBeTruthy();
        expect((first?.[0] ?? 0) - (again?.[0] ?? 0)).toBe(MIDDLE);
        expect(
          Math.abs((first?.[1] ?? 0) - (again?.[1] ?? 0)),
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("thins out toward its tip: the strands end one after another, the thinnest last, curling", () => {
    const ends = ["ba", "bb", "bc"].map((id) =>
      Math.min(...onPath(under, id).map((p) => p[0])),
    );
    const tip = onPath(under, "bc").at(-1);

    expect(ends[0]).toBeGreaterThan(ends[1] ?? 0);
    expect(ends[1]).toBeGreaterThan(ends[2] ?? 0);
    expect(ends[2]).toBeGreaterThan(0);
    expect(strandWidth(under, "ba")).toBeGreaterThan(strandWidth(under, "bc"));
    // Curled up, well off the bough's own level.
    expect(tip?.[1]).toBeLessThan(TALL / 2 - 30);
    expect(onPath(over, "bc").at(-1)?.[1]).toBeGreaterThan(TALL / 2 + 30);
  });

  it("is thinner when it is a lesser bough, and has three strands, not four", () => {
    expect(strandWidth(over, "ba")).toBeLessThan(strandWidth(under, "ba"));
    expect(idsOf(over)).not.toContain("bd");
    expect(idsOf(under)).toContain("bd");
  });

  it("grows its leaves on the tip only, within the band it is given: none where the picture is cut or stretched", () => {
    const leaves = [...under.matchAll(LEAF)].map(
      (m) => [Number(m[1]), Number(m[2])] as const,
    );

    expect(leaves.length).toBeGreaterThan(2);
    expect(leaves.filter(([x]) => x < 12 || x > TIP - 12)).toEqual([]);
    expect(
      leaves.filter(([, y]) => y < TALL / 2 - 30 || y > TALL / 2 + 70),
    ).toEqual([]);
    expect([...over.matchAll(LEAF)]).toEqual([]);
  });

  it("stays inside its picture", () => {
    for (const svg of [under, over]) {
      const ys = pathPoints(svg, "b").map((p) => p[1]);

      expect(Math.min(...ys)).toBeGreaterThan(8);
      expect(Math.max(...ys)).toBeLessThan(TALL - 8);
    }
  });

  it("stays small", () => {
    expect(under.length).toBeLessThan(22_000);
    expect(over.length).toBeLessThan(14_000);
  });
});
