import { describe, expect, it } from "vitest";
import { wovenFrame } from "./frame.ts";
import { FACES, inBox, inView, THICKNESS, TILE } from "./geometry.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

describe("wovenFrame", () => {
  const frame = wovenFrame();

  it("is the same picture every time", () => {
    expect(wovenFrame()).toBe(frame);
  });

  it("twists two branches and a withy along each of the four sides", () => {
    const strands = idsOf(frame).filter((id) => /^s[lrtb][abc]$/.test(id));

    expect(strands).toHaveLength(12);
  });

  it("refers only to what it defines", () => {
    const ids = new Set(idsOf(frame));

    expect(linksOf(frame).filter((link) => !ids.has(link))).toEqual([]);
    expect(frame).not.toMatch(/NaN|undefined/);
  });

  it("keeps every branch inside the picture and off the faces", () => {
    const points = pathPoints(frame, "s");

    expect(points.length).toBeGreaterThan(300);
    expect(points.filter((p) => !inView(p, 4))).toEqual([]);
    expect(points.filter((p) => inBox(FACES, p))).toEqual([]);
  });

  it("keeps the branches' centre lines on the rim of the video", () => {
    const rim = THICKNESS;
    const inner = {
      left: TILE.left + rim,
      top: TILE.top + rim,
      right: TILE.right - rim,
      bottom: TILE.bottom - rim,
    };

    expect(pathPoints(frame, "s").filter((p) => inBox(inner, p))).toEqual([]);
  });

  it("is well formed", () => {
    expect(isWellFormed(frame)).toBe(true);
  });

  it("passes the first branch over the second at every other crossing", () => {
    // Along the top side: where the two branches cross, and the windows in
    // which the first is drawn again, over the second.
    const height = (id: string): ((x: number) => number) => {
      const points = pathPoints(frame, id).filter(
        (_, i) => i === 0 || i % 2 === 1,
      );
      return (x) => {
        const after = points.findIndex((p) => p[0] >= x);
        const [a, b] = [points[after - 1], points[after]];
        if (!a || !b) throw new Error(`no branch at ${String(x)}`);
        return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      };
    };
    const [first, second] = [height("sta"), height("stb")];
    const windows = [
      ...(/<clipPath id="ot">(.*?)<\/clipPath>/
        .exec(frame)?.[1]
        ?.matchAll(/x="(-?\d+)" y="-?\d+" width="(\d+)"/g) ?? []),
    ].map((m) => Number(m[1]) + Number(m[2]) / 2);

    expect(windows.length).toBeGreaterThan(3);
    for (const x of windows.slice(1, -1))
      expect(Math.abs(first(x) - second(x)), `at ${String(x)}`).toBeLessThan(5);
    // Between two windows the branches cross once more, the other way up.
    const gaps = windows.slice(1).map((x, i) => x - (windows[i] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(200);
      expect(gap).toBeLessThan(280);
    }
  });

  it("has a window of crossings for each side", () => {
    const windows = [
      ...frame.matchAll(/<clipPath id="o[lrtb]">(.*?)<\/clipPath>/g),
    ];

    expect(windows).toHaveLength(4);
    for (const w of windows)
      expect((w[1] ?? "").match(/<rect/g)?.length).toBeGreaterThan(1);
  });

  it("gives the shadow room to spread past the branches on every side", () => {
    expect(frame).toMatch(
      /<filter id="fs" filterUnits="userSpaceOnUse" x="0" y="0" width="1220" height="782\.5">/,
    );
  });

  it("stays a small file", () => {
    expect(frame.length).toBeLessThan(32_000);
  });
});
