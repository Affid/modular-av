// The theme module and the art agree: the stylesheet names the pictures
// that are made, and both use the measures the art was made to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { heightOf } from "../scrolls/geometry.ts";
import { drawnFiles } from "./files.ts";
import { PICTURES, REACH, TALLY, TILE } from "./geometry.ts";
import { HIDES, renderedNames } from "./rendered.ts";

const THEME = join(ROOT, "packages", "dock-hides");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/hides.css");
const entry = await read("src/index.ts");
/** The stylesheet with every run of white space as one space, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ");
const percent = (share: number): string =>
  `${String(Math.round(share * 10000) / 100)}%`;

describe("the hides theme", () => {
  it("names every picture in its stylesheet, drawn and rendered, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("art\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual(
      [...drawnFiles().keys(), ...renderedNames()].sort(),
    );
  });

  it("registers the reach the hides' frames were made for, once", () => {
    expect(entry).toContain(
      `reach: { top: ${String(REACH.top)}, right: ${String(REACH.right)}, bottom: ${String(REACH.bottom)}, left: ${String(REACH.left)} }`,
    );
    // The room round a tile is the frame's whole reach: frames never lie on each other.
    expect(entry).not.toMatch(/\b(room|gridRoom):/);
    // The stylesheet reads the frame layer's size from the dock: it sets none of its own.
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("shows a rendered hide as its preview", () => {
    const preview = /preview: file\("art\/([^"]+)"\)/.exec(entry)?.[1];

    expect(preview).toBe("hide-1.webp");
    expect(renderedNames()).toContain(preview);
  });

  it("gives odd and even cameras a hide each, with its own cut thongs, light and paint", () => {
    for (const k of HIDES)
      for (const [name, kind] of [
        ["hide", "hide"],
        ["cut", "hide-cut"],
        ["light", "light"],
        ["daubs", "paint"],
      ] as const)
        expect(flat).toContain(
          `--hides-${name}: url("art/${kind}-${String(k)}.webp")`,
        );
  });

  it("lays the level meter over the row the tally marks were drawn in, and cuts it to them", () => {
    const sides = percent(TALLY.left / TILE.width);

    expect(flat).toContain(
      `.mav-meter { inset: ${percent(TALLY.top / TILE.height)} ${sides} auto;`,
    );
    expect(flat).toContain(
      `height: ${percent(heightOf(TALLY) / TILE.height)};`,
    );
    expect(css).toMatch(
      /\.mav-meter \{[^}]*mask: url\("art\/tally\.svg"\) 0 0 \/ 100% 100% no-repeat/,
    );
  });

  it("repeats the wall and the leather at the size each was rendered for: one repeat each way", () => {
    for (const name of ["wall", "leather"] as const) {
      const { width, height } = PICTURES[name];

      expect(width).toBe(height);
      expect(flat).toContain(
        `url("art/${name}.webp") 0 0 / ${String(width)}px ${String(height)}px`,
      );
    }
  });

  it("cuts the nailed piece in nine and the name's tag in three where they were made to be cut", () => {
    const { piece, tag } = PICTURES;

    expect(flat).toContain(
      `border-image: url("art/piece.webp") ${String(piece.edge * piece.density)} / ${String(piece.edge)}px /`,
    );
    expect(flat).toContain(
      `border-image: url("art/tag.webp") 0 ${String(tag.end * tag.density)} fill /`,
    );
  });

  it("hangs the skull at its own size, only where the cameras leave room for it", () => {
    const { skull } = PICTURES;
    const from = Number(
      /--hides-trophy: clamp\(0, var\(--mav-dock-spare, 0\) - (\d+), 1\)/.exec(
        flat,
      )?.[1],
    );
    const foot = Number(
      /skull\.webp"\) 50% calc\(100% - (\d+)px\)/.exec(flat)?.[1],
    );

    expect(flat).toContain(
      `calc(${String(skull.width)}px * var(--hides-trophy)) ${String(skull.height)}px no-repeat`,
    );
    expect(from + 1).toBeGreaterThanOrEqual(skull.height + foot);
  });

  it("lays a button's iron over it whole, and in two parts where an arrow stands beside it", () => {
    for (const name of ["stud", "stud-left", "stud-right"])
      expect(flat).toContain(`background-image: url("art/${name}.webp")`);
  });
});
