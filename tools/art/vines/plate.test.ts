import { describe, expect, it } from "vitest";
import { PLATE } from "./plant.ts";
import { drawLoop, drawMeterVine, drawPlate } from "./plate.ts";
import { isWellFormed } from "./svg.ts";

const plate = drawPlate(4);

describe("drawPlate", () => {
  it("draws the same strip of bark every time, and another for another seed", () => {
    expect(drawPlate(4)).toBe(plate);
    expect(drawPlate(5)).not.toBe(plate);
  });

  it("is well formed and has a size of its own, for a stylesheet to slice by", () => {
    expect(isWellFormed(plate)).toBe(true);
    expect(plate).toContain(
      `width="${String(PLATE.width)}" height="${String(PLATE.height)}" viewBox="0 0 300 80"`,
    );
  });

  it("has broken ends inside the slices that keep their shape, and nearly straight edges between", () => {
    const outline =
      /<path d="M([^"]+)Z" fill="url\(#bk\)"/.exec(plate)?.[1] ?? "";
    const points = [...outline.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(
      (m) => [Number(m[1]), Number(m[2])] as const,
    );
    const end = (PLATE.end / PLATE.width) * 300;
    const between = points.filter(([x]) => x > end && x < 300 - end);
    const ends = points.filter(([x]) => x <= end || x >= 300 - end);

    expect(points.length).toBeGreaterThan(20);
    // Between the ends: two edges, each within a few units of level.
    for (const [, y] of between)
      expect(Math.min(Math.abs(y - 6), Math.abs(y - 75))).toBeLessThan(4);
    // The ends are jagged: their points are not in line.
    expect(new Set(ends.map(([x]) => Math.round(x))).size).toBeGreaterThan(6);
  });

  it("is dark bark all through: the name on it is light", () => {
    const stops = [...plate.matchAll(/stop-color="#([0-9a-f]{6})"/g)].map(
      (m) => m[1] ?? "",
    );
    const light = (hex: string): number =>
      [0, 2, 4].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) /
      3;

    expect(stops.length).toBeGreaterThan(1);
    for (const stop of stops) expect(light(stop)).toBeLessThan(70);
  });

  it("stays small", () => {
    expect(plate.length).toBeLessThan(2_600);
  });
});

describe("drawLoop", () => {
  const loop = drawLoop(5);

  it("draws a loop of withy: two turns over the top of its picture and down to the plate", () => {
    const paths = [
      ...loop.matchAll(
        /<path d="M(-?[\d.]+) (-?[\d.]+)C[^"]*? (-?[\d.]+) (-?[\d.]+)"/g,
      ),
    ];

    expect(isWellFormed(loop)).toBe(true);
    expect(drawLoop(5)).toBe(loop);
    expect(paths.length).toBe(6);
    // Each turn starts and ends at the foot of the picture.
    for (const m of paths) {
      expect(Number(m[2])).toBeGreaterThan(90);
      expect(Number(m[4])).toBeGreaterThan(90);
    }
    expect(loop.length).toBeLessThan(1_400);
  });
});

describe("drawMeterVine", () => {
  const vine = drawMeterVine();

  it("draws a creeping shoot with leaves in one colour, as a mask", () => {
    const colours = new Set(
      [...vine.matchAll(/(?:stroke|fill)="(#[0-9a-f]+|none)"/g)].map(
        (m) => m[1],
      ),
    );

    expect(isWellFormed(vine)).toBe(true);
    expect([...colours].filter((c) => c !== "none")).toEqual(["#fff"]);
    expect(vine.match(/<path d="M0 0C/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("repeats: the shoot leaves its picture at the height it enters it", () => {
    const d =
      /<path d="M(-?[\d.]+) (-?[\d.]+)C[^"]* (-?[\d.]+) (-?[\d.]+)" fill="none"/.exec(
        vine,
      );

    expect(d?.[2]).toBe(d?.[4]);
    expect(Number(d?.[1])).toBeLessThan(0);
    expect(Number(d?.[3])).toBeGreaterThan(120);
  });
});
