// The theme module and the art agree: the stylesheet names the pictures
// that are made, and both use the measures the art was made to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { heightOf } from "../scrolls/geometry.ts";
import { LEVEL, PICTURES, PLATE, REACH, THINGS, TILE } from "./geometry.ts";
import { PLATES, renderedNames } from "./rendered.ts";

const THEME = join(ROOT, "packages", "dock-plates");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/plates.css");
const entry = await read("src/index.ts");
/** The stylesheet with every run of white space as one space, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ");
const percent = (share: number): string =>
  `${String(Math.round(share * 10000) / 100)}%`;
/** The free height from which a switch is on: `--plates-<name>: clamp(0, spare - N, 1)` is 1 from N + 1. */
const from = (name: string): number =>
  Number(
    new RegExp(
      `--plates-${name}: clamp\\(0, var\\(--mav-dock-spare, 0\\) - (\\d+), 1\\)`,
    ).exec(flat)?.[1],
  ) + 1;

describe("the plates theme", () => {
  it("names every rendered picture in its stylesheet, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("art\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual([...renderedNames()].sort());
  });

  it("registers the reach the plates were made for, once", () => {
    expect(entry).toContain(
      `reach: { top: ${String(REACH.top)}, right: ${String(REACH.right)}, bottom: ${String(REACH.bottom)}, left: ${String(REACH.left)} }`,
    );
    // The room round a tile is the plate's whole reach: plates never lie on each other.
    expect(entry).not.toMatch(/\b(room|gridRoom):/);
    // The stylesheet reads the frame layer's size from the dock: it sets none of its own.
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("shows a rendered plate as its preview", () => {
    const preview = /preview: file\("art\/([^"]+)"\)/.exec(entry)?.[1];

    expect(preview).toBe("plate-1.webp");
    expect(renderedNames()).toContain(preview);
  });

  it("gives odd and even cameras a plate each: at rest, polished, out of the call, and its cord whole and lost", () => {
    for (const k of PLATES)
      for (const [name, kind] of [
        ["plate", "plate"],
        ["polished", "plate-polished"],
        ["out", "plate-out"],
        ["cord", "cord"],
        ["cord-out", "cord-out"],
      ] as const)
        expect(flat).toContain(
          `--plates-${name}: url("art/${kind}-${String(k)}.webp")`,
        );
  });

  it("lays the knife only on the plate that has a level: the viewer's own", () => {
    expect(flat).toContain(
      '.mav-dock-tile:has(> .mav-meter) { --plates-knife: url("art/knife.webp"); }',
    );
  });

  it("lays the level meter over the blade's box, and cuts it to the blade", () => {
    const inset = [
      percent(LEVEL.top / TILE.height),
      percent((TILE.width - LEVEL.right) / TILE.width),
      "auto",
      percent(LEVEL.left / TILE.width),
    ].join(" ");

    expect(flat).toContain(`.mav-meter { inset: ${inset};`);
    expect(flat).toContain(
      `height: ${percent(heightOf(LEVEL) / TILE.height)};`,
    );
    expect(css).toMatch(
      /\.mav-meter \{[^}]*mask: url\("art\/blade\.webp"\) 0 0 \/ 100% 100% no-repeat/,
    );
  });

  it("cuts the name into the black band: its middle under the rib and over the knife", () => {
    const middle =
      (Number(
        /\.mav-dock-tile-bar \{ inset: ([\d.]+)% 0 auto; translate: 0 -50%;/.exec(
          flat,
        )?.[1],
      ) /
        100) *
      TILE.height;

    expect(middle).toBeGreaterThan(TILE.height + PLATE.ribAt + PLATE.ribHalf);
    expect(middle).toBeLessThan(LEVEL.top);
  });

  it("repeats the mail and the steel at the size each was rendered for: one repeat each way", () => {
    for (const name of ["mail", "steel"] as const) {
      const { width, height } = PICTURES[name];

      expect(flat).toContain(
        `url("art/${name}.webp") 0 0 / ${String(width)}px ${String(height)}px`,
      );
    }
  });

  it("cuts the larger plate in nine where it was made to be cut", () => {
    const { lame } = PICTURES;

    expect(flat).toContain(
      `border-image: url("art/lame.webp") ${String(lame.edge * lame.density)} / ${String(lame.edge)}px /`,
    );
  });

  it("shows each thing at its own size, the tallest that fits whole, one at a time", () => {
    const [low, mid, high] = [
      PICTURES.mace,
      PICTURES.gauntlets,
      PICTURES.buckler,
    ];
    // From the lowest to the tallest, as the measures list them.
    expect(THINGS).toEqual(["mace", "gauntlets", "buckler"]);
    const foot = Number(
      /mace\.webp"\) 50% calc\(100% - (\d+)px\)/.exec(flat)?.[1],
    );
    const size = (width: number, on: string, height: number): string =>
      `calc(${String(width)}px * ${on}) ${String(height)}px no-repeat`;

    // A switch is on from the height its thing needs; the one above it turns it off again.
    expect(flat).toContain(size(high.width, "var(--plates-high)", high.height));
    expect(flat).toContain(
      size(mid.width, "(var(--plates-mid) - var(--plates-high))", mid.height),
    );
    expect(flat).toContain(
      size(low.width, "(var(--plates-low) - var(--plates-mid))", low.height),
    );
    expect(from("low")).toBeGreaterThanOrEqual(low.height + foot);
    expect(from("mid")).toBeGreaterThanOrEqual(mid.height + foot);
    expect(from("high")).toBeGreaterThanOrEqual(high.height + foot);
    expect(from("low")).toBeLessThan(from("mid"));
    expect(from("mid")).toBeLessThan(from("high"));
    for (const name of THINGS)
      expect(flat).toContain(
        `url("art/${name}.webp") 50% calc(100% - ${String(foot)}px)`,
      );
  });

  it("lays one of two small plates over a button, and one longer plate in two parts where an arrow stands beside it", () => {
    for (const name of ["tab-1", "tab-2", "tab-left", "tab-right"])
      expect(flat).toContain(`background-image: url("art/${name}.webp")`);
    // Neighbours differ: every other button takes the second plate.
    expect(flat).toContain(
      '.mav-dock-button:nth-child(even) { background-image: url("art/tab-2.webp"); }',
    );
  });
});
