// The theme module and the art agree: the stylesheet names the pictures
// that are drawn, and both use the measures the art was drawn to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { artFiles } from "./files.ts";
import { GRID_ROOM, REACH, ROOM, TILE, VIEW } from "./geometry.ts";
import { LIANA_VIEW } from "./liana.ts";
import { BOUGH, BRANCH, BRANCH_ROOT, PLATE, TRUNK } from "./plant.ts";

const THEME = join(ROOT, "packages", "dock-vines");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/vines.css");
const entry = await read("src/index.ts");
/** The stylesheet with every run of white space as one space, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ");
const sides = (r: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): string =>
  `{ top: ${String(r.top)}, right: ${String(r.right)}, bottom: ${String(r.bottom)}, left: ${String(r.left)} }`;
const percent = (share: number): string =>
  `${String(Math.round(share * 10000) / 100)}%`;
const TILE_WIDE = TILE.right - TILE.left;
const TILE_TALL = TILE.bottom - TILE.top;

describe("the vines theme", () => {
  it("names every picture in its stylesheet, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("frames\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual([...artFiles().keys()].sort());
  });

  it("registers the reach the art was drawn for, once", () => {
    const even = { top: REACH, right: REACH, bottom: REACH, left: REACH };

    expect(entry).toContain(`reach: ${sides(even)}`);
    // The stylesheet reads the frame layer's size from the dock: it sets none of its own.
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("registers the room the art needs round a tile: more under it for its name, less in a grid", () => {
    expect(entry).toContain(`room: ${sides(ROOM)}`);
    expect(entry).toContain(`gridRoom: ${sides(GRID_ROOM)}`);
    expect(ROOM.bottom).toBeGreaterThan(REACH);
    expect(GRID_ROOM.left).toBeLessThan(REACH);
  });

  it("shows a picture the generator draws as its preview", () => {
    const preview = /preview: file\("frames\/([^"]+)"\)/.exec(entry)?.[1];

    expect(artFiles().has(preview ?? "")).toBe(true);
  });

  it("cuts the video to its frame's shape, and the light to where the branches aren't, in every layout", () => {
    expect(css).toMatch(
      /\.mav-theme-vines \.mav-dock-tile-video \{[^}]*mask: var\(--vines-shape\)/,
    );
    expect(css).toMatch(
      /\.mav-theme-vines \.mav-dock-tile-media \{[^}]*background: var\(--vines-shape\)/,
    );
    expect(css).toMatch(
      /\.mav-theme-vines \.mav-dock-tile-frame::after \{[^}]*mask: var\(--vines-light\)/,
    );
  });

  it("repeats the trunk at the size it was drawn, its centre line where the dock's ground stops", () => {
    expect(flat).toContain(
      `url("frames/trunk.svg") 0 0 / ${String(TRUNK.width)}px ${String(TRUNK.period)}px repeat-y`,
    );
    expect(flat).toContain(
      `url("frames/trunk-across.svg") 0 0 / ${String(TRUNK.period)}px ${String(TRUNK.width)}px repeat-x`,
    );
    expect(flat).toContain(`--vines-trunk: ${String(TRUNK.centre)}px;`);
  });

  it("cuts each bough where it was drawn to be cut: tip, a middle that repeats, joint", () => {
    const slices = `0 ${String(BOUGH.joint)} 0 ${String(BOUGH.tip)} fill / 0 ${String(BOUGH.joint)}px 0 ${String(BOUGH.tip)}px round`;

    for (const name of ["top", "header", "panel", "foot"])
      expect(flat).toContain(`url("frames/bough-${name}.svg") ${slices}`);
    expect(flat).toContain(`--vines-bough: ${String(BOUGH.height)}px;`);
  });

  it("lays the lianas' pictures where they were drawn: as wide as the frame layer, from above the tile", () => {
    const tall = (hang: keyof typeof LIANA_VIEW): string =>
      percent((LIANA_VIEW[hang].bottom - LIANA_VIEW[hang].top) / TILE_TALL);

    expect(flat).toContain(`left: ${percent(-TILE.left / TILE_WIDE)};`);
    expect(flat).toContain(`width: ${percent(VIEW.width / TILE_WIDE)};`);
    expect(flat).toContain(
      `top: ${percent((LIANA_VIEW.tied.top - TILE.top) / TILE_TALL)};`,
    );
    expect(flat).toContain(`--vines-tied-tall: ${tall("tied")};`);
    expect(flat).toContain(`--vines-short-tall: ${tall("short")};`);
    expect(flat).toContain(`--vines-loose-tall: ${tall("loose")};`);
  });

  it("lets the loose ends hang only where there is room for all of them under the tile", () => {
    /** How far a picture reaches under the room the dock keeps for the tile, in tile widths. */
    const under = (hang: keyof typeof LIANA_VIEW): number =>
      (LIANA_VIEW[hang].bottom - TILE.bottom) / TILE_WIDE - GRID_ROOM.bottom;
    const from = (name: string): number =>
      Number(new RegExp(`--vines-${name}-from: ([\\d.]+);`).exec(css)?.[1]);

    expect(from("loose")).toBeGreaterThanOrEqual(under("loose"));
    expect(from("loose")).toBeLessThan(under("loose") + 0.05);
    expect(from("short")).toBeGreaterThanOrEqual(under("short"));
    expect(from("short")).toBeLessThan(under("short") + 0.05);
  });

  it("shows the branch in the size there is room for, at the size it was drawn, its foot on the trunk", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const { width, height, from } = BRANCH[size];

      expect(flat).toContain(`--vines-${size}-from: ${String(from)};`);
      expect(flat).toContain(
        `calc(${String(width)}px * var(--vines-${size})) ${String(height)}px`,
      );
    }
    expect(flat).toContain(
      `--vines-branch-foot: ${String(TRUNK.centre - BRANCH_ROOT.right)}px;`,
    );
  });

  it("hangs a name on the plate by the ends that keep their shape", () => {
    expect(flat).toContain(
      `border-image: url("frames/plate.svg") 0 ${String(PLATE.end)} fill /`,
    );
  });
});
