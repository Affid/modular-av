import { describe, expect, it } from "vitest";
import { drawBranch } from "./branch.ts";
import { BRANCH, BRANCH_ROOT, type BranchSize, UNITS } from "./plant.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

const SIZES: readonly BranchSize[] = ["small", "medium", "large"];
const drawn = Object.fromEntries(
  SIZES.map((size) => [size, drawBranch(size)]),
) as Record<BranchSize, string>;
const LEAF =
  /<use href="#(?:ivy5|ivy3|heart|young)" transform="translate\((-?\d+) (-?\d+)\)/g;
const leaves = (svg: string): readonly (readonly [number, number])[] =>
  [...svg.matchAll(LEAF)].map((m) => [Number(m[1]), Number(m[2])] as const);
const limbs = (svg: string): readonly string[] =>
  idsOf(svg).filter((id) => /^g\d+a?$/.test(id));

describe("drawBranch", () => {
  it("draws the same branch every time, and a different one in each size", () => {
    expect(drawBranch("medium")).toBe(drawn.medium);
    expect(new Set(Object.values(drawn)).size).toBe(3);
  });

  it.each(SIZES)(
    "is well formed, refers only to what it defines, and fills its box (%s)",
    (size) => {
      const svg = drawn[size];
      const ids = new Set(idsOf(svg));
      const { width, height } = BRANCH[size];

      expect(isWellFormed(svg)).toBe(true);
      expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
      expect(ids.size).toBe(idsOf(svg).length);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(svg).toContain(
        `viewBox="0 0 ${String(width * UNITS)} ${String(height * UNITS)}"`,
      );
    },
  );

  it.each(SIZES)(
    "leaves the trunk past its right edge, near its foot (%s)",
    (size) => {
      const [first] = pathPoints(drawn[size], "g0");
      const { width, height } = BRANCH[size];

      expect(first?.[0]).toBeCloseTo((width + BRANCH_ROOT.right) * UNITS, -1);
      expect(first?.[1]).toBeCloseTo((height - BRANCH_ROOT.up) * UNITS, -1);
    },
  );

  it.each(SIZES)(
    "forks into thinner limbs that stay in the picture, and leaves on the thin ones only (%s)",
    (size) => {
      const svg = drawn[size];
      const { width, height } = BRANCH[size];
      const points = idsOf(svg)
        .filter((id) => /^g[1-9]/.test(id))
        .flatMap((id) => pathPoints(svg, id));
      const grown = leaves(svg);

      expect(limbs(svg).length).toBeGreaterThanOrEqual(3);
      expect(
        points.filter(([x, y]) => x < 30 || y < 30 || y > height * UNITS - 10),
      ).toEqual([]);
      expect(grown.length).toBeGreaterThan(5);
      expect(
        grown.filter(
          ([x, y]) =>
            x < 14 ||
            x > width * UNITS - 150 ||
            y < 14 ||
            y > height * UNITS - 30,
        ),
      ).toEqual([]);
    },
  );

  it("grows taller and into more limbs with more room", () => {
    const top = (size: BranchSize): number =>
      BRANCH[size].height * UNITS -
      Math.min(...pathPoints(drawn[size], "g").map((p) => p[1]));

    expect(top("medium")).toBeGreaterThan(top("small") * 1.5);
    expect(top("large")).toBeGreaterThan(top("medium") * 1.3);
    expect(limbs(drawn.large).length).toBeGreaterThan(
      limbs(drawn.small).length,
    );
    // The tall one climbs most of its picture.
    expect(top("large")).toBeGreaterThan(BRANCH.large.height * UNITS * 0.75);
  });

  it("twists its thicker limbs from two strands, like every branch of the plant", () => {
    expect(
      idsOf(drawn.medium).filter((id) => /^g\d+a$/.test(id)).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      idsOf(drawn.medium).filter((id) => /^g\d+b$/.test(id)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("stays small", () => {
    expect(drawn.small.length).toBeLessThan(18_000);
    expect(drawn.large.length).toBeLessThan(50_000);
  });
});
