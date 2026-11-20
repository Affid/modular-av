// The theme module and the art agree: the stylesheet names the pictures
// that are drawn, and both use the measures the art was drawn to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { artFiles } from "./files.ts";
import { COVER, REACH, TILE, VIEW } from "./geometry.ts";

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

  it("shows a picture the generator draws as its preview", async () => {
    const entry = await read("src/index.ts");
    const preview = /preview: file\("frames\/([^"]+)"\)/.exec(entry)?.[1];

    expect(artFiles().has(preview ?? "")).toBe(true);
  });

  it("lays the speaking glow just inside the branches", async () => {
    const css = await read("public/vines.css");
    const percent = (n: number): string =>
      `${String(Math.round(n * 1000) / 10)}%`;
    const fromTop = (TILE.top + COVER) / VIEW.height;
    const fromSide = (TILE.left + COVER) / VIEW.width;

    expect(css).toContain(`inset: ${percent(fromTop)} ${percent(fromSide)};`);
  });
});
