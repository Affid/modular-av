// The theme module and the art agree: the stylesheet names the pictures
// that are made, and both use the measures the art was made to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Box } from "../vines/geometry.ts";
import { ROOT } from "../../workspace.ts";
import { drawnFiles } from "./files.ts";
import {
  HALO,
  heightOf,
  LINE,
  PICTURES,
  REACH,
  TILE,
  VIEW,
  widthOf,
} from "./geometry.ts";
import { renderedNames } from "./rendered.ts";

const THEME = join(ROOT, "packages", "dock-scrolls");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/scrolls.css");
const entry = await read("src/index.ts");
/** The stylesheet with every run of white space as one space, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ");
const percent = (share: number): string =>
  `${String(Math.round(share * 10000) / 100)}%`;

/** Where a box lies in the frame layer, as the stylesheet places a layer over it. */
const placed = (box: Box): string =>
  `top: ${percent((box.top - VIEW.top) / heightOf(VIEW))}; left: ${percent((box.left - VIEW.left) / widthOf(VIEW))}; width: ${percent(widthOf(box) / widthOf(VIEW))}; height: ${percent(heightOf(box) / heightOf(VIEW))};`;

/** The number in a `clamp()` switch: the spare height from which a picture shows is one more. */
const switchOf = (name: string): number =>
  Number(
    new RegExp(
      `--scrolls-${name}: clamp\\(0, var\\(--mav-dock-spare, 0\\) - (\\d+), 1\\)`,
    ).exec(flat)?.[1],
  );

describe("the scrolls theme", () => {
  it("names every picture in its stylesheet, drawn and rendered, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("art\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual(
      [...drawnFiles().keys(), ...renderedNames()].sort(),
    );
  });

  it("registers the reach the scrolls were made for, once", () => {
    expect(entry).toContain(
      `reach: { top: ${String(REACH.top)}, right: ${String(REACH.right)}, bottom: ${String(REACH.bottom)}, left: ${String(REACH.left)} }`,
    );
    // The room round a tile is the scroll's whole reach: scrolls never lie on each other.
    expect(entry).not.toMatch(/\b(room|gridRoom):/);
    // The stylesheet reads the frame layer's size from the dock: it sets none of its own.
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("shows a rendered scroll as its preview", () => {
    const preview = /preview: file\("art\/([^"]+)"\)/.exec(entry)?.[1];

    expect(renderedNames()).toContain(preview);
  });

  it("lays the signs' light and its glow where the signs were drawn", () => {
    expect(flat).toContain(`.mav-dock-tile-frame::after { ${placed(LINE)}`);
    expect(flat).toContain(`.mav-dock-tile-frame::before { ${placed(HALO)}`);
  });

  it("lays the level meter over the same row of signs, and cuts it to them", () => {
    const sides = percent(LINE.left / TILE.width);

    expect(TILE.width - LINE.right).toBe(LINE.left);
    expect(flat).toContain(
      `.mav-meter { inset: ${percent(LINE.top / TILE.height)} ${sides} auto;`,
    );
    expect(flat).toContain(`height: ${percent(heightOf(LINE) / TILE.height)};`);
    expect(css).toMatch(
      /\.mav-meter \{[^}]*mask: var\(--scrolls-signs\) 0 0 \/ 100% 100% no-repeat/,
    );
  });

  it("lays the stones and their shadow over the whole frame layer, as large as the dock makes it", () => {
    expect(flat).toContain(
      "inset: calc(var(--mav-dock-frame-top, 0) * -177.78%) calc(var(--mav-dock-frame-right, 0) * -100%) calc(var(--mav-dock-frame-bottom, 0) * -177.78%) calc(var(--mav-dock-frame-left, 0) * -100%);",
    );
  });

  it("repeats the desk at the size it was rendered for: one repeat of its wood each way", () => {
    const { width, height } = PICTURES.desk;

    expect(width).toBe(height);
    expect(flat).toContain(
      `url("art/desk.webp") 0 0 / ${String(width)}px ${String(height)}px`,
    );
  });

  it("cuts the paper in nine and the plate in three where they were made to be cut", () => {
    const { paper, plate } = PICTURES;

    expect(flat).toContain(
      `border-image: url("art/paper.webp") ${String(paper.edge * paper.density)} fill / ${String(paper.edge)}px /`,
    );
    expect(flat).toContain(
      `border-image: url("art/plate.webp") 0 ${String(plate.end * plate.density)} fill /`,
    );
  });

  it("shows the desk's things and the wand at their own size, only where there is room for them", () => {
    const { things, wand } = PICTURES;
    /** How far above the list's foot each picture's lower edge is. */
    const foot = (name: string): number =>
      Number(
        new RegExp(`${name}\\.webp"\\) 50% calc\\(100% - (\\d+)px\\)`).exec(
          flat,
        )?.[1],
      );

    expect(flat).toContain(
      `calc(${String(things.width)}px * var(--scrolls-things)) ${String(things.height)}px no-repeat`,
    );
    expect(flat).toContain(
      `calc(${String(wand.width)}px * var(--scrolls-wand)) ${String(wand.height)}px no-repeat`,
    );
    expect(switchOf("things") + 1).toBeGreaterThanOrEqual(
      things.height + foot("things"),
    );
    // The wand lies above the things, clear of them.
    expect(foot("wand")).toBeGreaterThanOrEqual(things.height + foot("things"));
    expect(switchOf("wand") + 1).toBeGreaterThanOrEqual(
      wand.height + foot("wand"),
    );
  });
});
