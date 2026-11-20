import { describe, expect, it } from "vitest";
import { grow } from "./growth.ts";
import { paintFoliage, paintVines } from "./paint.ts";
import { idsOf, isWellFormed, linksOf } from "./svg.ts";

const growth = grow(11, "tl");
const LEAF_USE =
  /<use href="#(?:ivy5|ivy3|heart|young)" transform="([^"]+)" fill="(#[0-9a-f]+)"/g;
const leavesIn = (svg: string): readonly RegExpExecArray[] => [
  ...svg.matchAll(LEAF_USE),
];
/** A stretch of stem: a closed shape of straight edges. */
const RIBBON = /<path d="M[-\d. L]+Z"\/>/g;
const GREENS = [
  "#3f7d2c",
  "#4b9434",
  "#2f6a2a",
  "#5fa53a",
  "#3a7a3f",
  "#78b548",
  "#8cc152",
];

describe("paintVines", () => {
  const green = paintVines(growth, "green");
  const bare = paintVines(growth, "bare");

  it("is the same picture every time", () => {
    expect(paintVines(growth, "green")).toBe(green);
  });

  it("refers only to what it defines", () => {
    for (const svg of [green, bare]) {
      const ids = new Set(idsOf(svg));

      expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it("is well formed, with a shadow that can spread anywhere in the picture", () => {
    expect(isWellFormed(green)).toBe(true);
    expect(isWellFormed(bare)).toBe(true);
    expect(isWellFormed(paintFoliage(growth, "autumn"))).toBe(true);
    expect(green).toMatch(
      /<filter id="sb" filterUnits="userSpaceOnUse" x="0" y="0"/,
    );
  });

  it("paints every leaf in summer, each over its own shadow", () => {
    expect(leavesIn(green)).toHaveLength(growth.leaves.length);
    expect(green.match(/-s" transform=/g)).toHaveLength(growth.leaves.length);
    expect(green).toMatch(/<use href="#\w+-s"[^>]+\/><use href="#\w+" /);
  });

  it("paints summer leaves in greens only", () => {
    const fills = new Set(leavesIn(green).map((m) => m[2]));

    expect([...fills].filter((fill) => !GREENS.includes(fill ?? ""))).toEqual(
      [],
    );
    expect(fills.size).toBeGreaterThan(3);
  });

  it("paints the stems that are in sight, not the stretches behind the frame", () => {
    const ribbons = green.match(RIBBON) ?? [];
    const hidden = growth.stems.filter((stem) => stem.some((s) => !s.shown));

    // Each hidden stretch splits a stem in two; shadows double the count.
    expect(ribbons.length).toBeGreaterThanOrEqual(
      2 * (growth.stems.length + hidden.length),
    );
  });

  it("leaves only the hardiest leaves on bare stems, dry", () => {
    const hardy = growth.leaves.filter((l) => l.hardy < 0.14).length;
    const fills = leavesIn(bare).map((m) => m[2] ?? "");

    expect(fills).toHaveLength(hardy);
    expect(fills.filter((fill) => GREENS.includes(fill))).toEqual([]);
  });

  it("keeps the same stems when bare", () => {
    const stems = (svg: string): readonly string[] => svg.match(RIBBON) ?? [];

    expect(stems(green).length).toBeGreaterThan(0);

    expect(stems(bare)).toEqual(stems(green));
  });

  it("stays a small file", () => {
    expect(green.length).toBeLessThan(26_000);
  });
});

describe("paintFoliage", () => {
  const green = paintVines(growth, "green");
  const autumn = paintFoliage(growth, "autumn");

  it("lays an autumn leaf exactly over every summer leaf", () => {
    const places = (svg: string): readonly string[] =>
      leavesIn(svg).map((m) => m[1] ?? "");

    expect(places(autumn)).toEqual(places(green));
  });

  it("uses none of summer's greens", () => {
    const fills = leavesIn(autumn).map((m) => m[2] ?? "");

    expect(fills.filter((fill) => GREENS.includes(fill))).toEqual([]);
  });

  it("paints no stems: those show through from the picture under it", () => {
    expect(autumn.match(RIBBON)).toBeNull();
    expect(autumn).not.toContain("<filter");
  });

  it("refers only to what it defines", () => {
    const ids = new Set(idsOf(autumn));

    expect(linksOf(autumn).filter((link) => !ids.has(link))).toEqual([]);
  });
});
