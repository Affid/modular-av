// The theme module and the art agree: the stylesheet names the pictures
// that are drawn, and both use the measures the art was drawn to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { artFiles } from "./files.ts";
import { GRID_REACH, GRID_SHARE, GRID_VIEW, REACH, TILE } from "./geometry.ts";

const THEME = join(ROOT, "packages", "dock-vines");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");

describe("the vines theme", () => {
  it("names every picture in its stylesheet, and no other", async () => {
    const css = await read("public/vines.css");

    const named = new Set(
      [...css.matchAll(/url\("frames\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual([...artFiles().keys()].sort());
  });

  it("registers the reach the art was drawn for", async () => {
    const entry = await read("src/index.ts");
    const reach = String(REACH);

    expect(entry).toContain(
      `reach: { top: ${reach}, right: ${reach}, bottom: ${reach}, left: ${reach} }`,
    );
  });

  it("registers half a shared branch as its reach in a grid, and draws the cell in a layer as wide as the lattice's", async () => {
    const [entry, css] = [
      await read("src/index.ts"),
      await read("public/vines.css"),
    ];
    const share = String(Math.round(GRID_SHARE * 1000) / 1000);

    expect(entry).toContain(
      `gridReach: { top: ${share}, right: ${share}, bottom: ${share}, left: ${share} }`,
    );
    expect(css).toContain(`--mav-dock-frame-top: ${String(GRID_REACH)};`);
    expect(css).toContain(`--mav-dock-frame-left: ${String(GRID_REACH)};`);
  });

  it("lays the grid's speaking light on the video inside the frame layer", async () => {
    const css = await read("public/vines.css");
    const percent = (n: number): string =>
      `${String(Math.round(n * 10000) / 100)}%`;
    const wide = TILE.right - TILE.left;
    const fromSide = (GRID_REACH * wide) / (GRID_VIEW.right - GRID_VIEW.left);
    const fromTop = (GRID_REACH * wide) / (GRID_VIEW.bottom - GRID_VIEW.top);

    expect(css).toContain(`inset: ${percent(fromTop)} ${percent(fromSide)};`);
  });

  it("shows a picture the generator draws as its preview", async () => {
    const entry = await read("src/index.ts");
    const preview = /preview: file\("frames\/([^"]+)"\)/.exec(entry)?.[1];

    expect(artFiles().has(preview ?? "")).toBe(true);
  });

  it("cuts the video to its frame's shape, and the light to where the branches aren't", async () => {
    const css = await read("public/vines.css");

    expect(css).toMatch(
      /\.mav-dock-tile-video \{[^}]*mask: var\(--vines-shape\)/,
    );
    expect(css).toMatch(
      /\.mav-dock-tile-media \{[^}]*background: var\(--vines-shape\)/,
    );
    expect(css).toMatch(
      /\.mav-dock-tile-frame::after \{[^}]*mask: var\(--vines-light\)/,
    );
  });
});
