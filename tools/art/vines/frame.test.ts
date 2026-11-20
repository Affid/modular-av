import { describe, expect, it } from "vitest";
import { drawFrame } from "./frame.ts";
import { COVER, inView, TILE } from "./geometry.ts";
import { createOutline, SHADOW } from "./outline.ts";
import { idsOf, isWellFormed, linksOf, pathPoints } from "./svg.ts";

const outline = createOutline(9);
const art = drawFrame(outline, 109);
/** The middle of the picture, which no frame may cover. */
const MIDDLE = {
  left: TILE.left + COVER * (TILE.right - TILE.left),
  right: TILE.right - COVER * (TILE.right - TILE.left),
  top: TILE.top + COVER * (TILE.bottom - TILE.top),
  bottom: TILE.bottom - COVER * (TILE.bottom - TILE.top),
};

describe("drawFrame", () => {
  it("draws the same pictures every time", () => {
    expect(drawFrame(outline, 109)).toEqual(art);
  });

  it("draws another frame for another outline or another seed", () => {
    expect(drawFrame(createOutline(4), 109).frame).not.toBe(art.frame);
    expect(drawFrame(outline, 110).frame).not.toBe(art.frame);
  });

  it("twists four branches the whole way round, with seven shorter ones beside them", () => {
    const ids = idsOf(art.frame);

    expect(ids.filter((id) => /^w[abcd]$/.test(id))).toHaveLength(4);
    expect(ids.filter((id) => /^p\d$/.test(id))).toHaveLength(7);
  });

  it("gives no two of the branches round the loop the same thickness", () => {
    const widths = ["wa", "wb", "wc", "wd"].map(
      (id) =>
        new RegExp(
          `<use href="#${id}" stroke="#[0-9a-f]+" stroke-width="([\\d.]+)"`,
        ).exec(art.frame)?.[1],
    );

    expect(new Set(widths).size).toBe(4);
  });

  it.each(["frame", "shape", "light"] as const)(
    "makes a well-formed %s that refers only to what it defines",
    (name) => {
      const svg = art[name];
      const ids = new Set(idsOf(svg));

      expect(isWellFormed(svg)).toBe(true);
      expect(linksOf(svg).filter((link) => !ids.has(link))).toEqual([]);
    },
  );

  /** How far outside the picture's middle a point is: 0 on its edge or inside. */
  const clear = ([x, y]: readonly [number, number]): number =>
    Math.hypot(
      Math.max(MIDDLE.left - x, 0, x - MIDDLE.right),
      Math.max(MIDDLE.top - y, 0, y - MIDDLE.bottom),
    );
  const FRAMES = [
    [9, 109],
    [4, 104],
    [17, 117],
    [31, 131],
    [77, 5],
  ] as const;

  it.each(FRAMES)(
    "keeps every branch of outline %i, at its full thickness, inside the frame layer and out of the picture's middle",
    (outlineSeed, seed) => {
      const { frame } = drawFrame(createOutline(outlineSeed), seed);
      const points = [...pathPoints(frame, "w"), ...pathPoints(frame, "p")];
      // The thickest branch is 26 wide, with an outline of 2.
      const half = 15;

      expect(points.length).toBeGreaterThan(500);
      expect(points.filter((p) => !inView(p, 2))).toEqual([]);
      expect(points.filter((p) => clear(p) < half)).toEqual([]);
    },
  );

  it.each(FRAMES)(
    "keeps the shadow of outline %i's branches out of the picture's middle too",
    (outlineSeed, seed) => {
      const { frame } = drawFrame(createOutline(outlineSeed), seed);
      const points = [...pathPoints(frame, "w"), ...pathPoints(frame, "p")];
      // Shadows fall down and to the right: from the top and the left, into the picture.
      const over = points.filter(([x, y]) => y < MIDDLE.top || x < MIDDLE.left);
      const reach = 15 + Math.hypot(SHADOW.dx, SHADOW.dy) + 2 * SHADOW.blur;

      expect(over.filter((p) => clear(p) < reach * 0.9)).toEqual([]);
    },
  );

  it("passes the first branch over the second at every other crossing, wherever they fall", () => {
    const windows =
      /<clipPath id="wo">(.*?)<\/clipPath>/.exec(art.frame)?.[1] ?? "";
    const radii = [...windows.matchAll(/ r="(\d+)"/g)].map((m) => Number(m[1]));

    expect(radii.length).toBeGreaterThan(8);
    expect(radii.length).toBeLessThan(22);
    // The weave is uneven: not every window is the same size.
    expect(new Set(radii).size).toBeGreaterThan(1);
  });

  it("cuts the picture to the bundle's centre line, in the tile's own box", () => {
    expect(art.shape).toContain(
      `viewBox="${TILE.left} ${TILE.top} 1000 562.5"`,
    );
    expect(art.shape).toMatch(/<path d="M[-\d L]+Z" fill="#17110b"\/>/);
  });

  it("gives the light no line of its own: a blurred band with the branches cut out", () => {
    expect(art.light).not.toContain('stroke="#fff"');
    expect(art.light).toMatch(/fill-rule="evenodd" filter="url\(#lb\)"/);
    for (const id of idsOf(art.frame).filter((x) => /^(w[abcd]|p\d)$/.test(x)))
      expect(art.light).toContain(`<use href="#${id}" stroke-width=`);
  });

  it.each(FRAMES)(
    "keeps the light of outline %i, blur and all, out of the picture's middle",
    (outlineSeed, seed) => {
      const { light } = drawFrame(createOutline(outlineSeed), seed);
      const band =
        /<path d="(M[^"]+)" fill-rule="evenodd"/.exec(light)?.[1] ?? "";
      const points = [...band.matchAll(/(-?\d+) (-?\d+)/g)].map(
        (m) => [Number(m[1]), Number(m[2])] as const,
      );
      // The blur spreads twice its deviation of 9, and a little spare.
      const blur = 20;

      expect(points.length).toBeGreaterThan(200);
      expect(points.filter((p) => clear(p) < blur)).toEqual([]);
    },
  );

  it("stays small", () => {
    expect(art.frame.length).toBeLessThan(30_000);
    expect(art.light.length).toBeLessThan(18_000);
    expect(art.shape.length).toBeLessThan(4_000);
  });
});
