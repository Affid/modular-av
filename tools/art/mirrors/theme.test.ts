// The theme module and the art agree: the stylesheet names the pictures
// that are made, and both use the measures the art was made to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import { FILL, LEVEL, NAME, PICTURES, REACH, TILE, VIEW } from "./geometry.ts";
import { POSES, renderedNames } from "./rendered.ts";

const THEME = join(ROOT, "packages", "dock-mirrors");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/mirrors.css");
const entry = await read("src/index.ts");
/** The stylesheet with every run of white space as one space and none inside brackets, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
const percent = (share: number): string =>
  `${String(Math.round(share * 10000) / 100)}%`;
/** The free height from which a switch is on: `--mirrors-<name>: clamp(0, spare - N, 1)` is 1 from N + 1. */
const from = (name: string): number =>
  Number(
    new RegExp(
      `--mirrors-${name}: clamp\\(0, var\\(--mav-dock-spare, 0\\) - (\\d+), 1\\)`,
    ).exec(flat)?.[1],
  ) + 1;

describe("the mirrors theme", () => {
  it("names every rendered picture in its stylesheet, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("art\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual([...renderedNames()].sort());
  });

  it("registers the reach the hands were rendered for, once", () => {
    expect(entry).toContain(
      `reach: { top: ${String(REACH.top)}, right: ${String(REACH.right)}, bottom: ${String(REACH.bottom)}, left: ${String(REACH.left)} }`,
    );
    // The room round a tile is the reach: the name is lettered inside it.
    expect(entry).not.toMatch(/\b(room|gridRoom):/);
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("shows a rendered pair of hands as its preview", () => {
    const preview = /preview: file\("art\/([^"]+)"\)/.exec(entry)?.[1];

    expect(preview).toBe("hands-1.webp");
    expect(renderedNames()).toContain(preview);
  });

  it("gives each pose of hands its own light, at rest and speaking", () => {
    for (const k of POSES)
      for (const [name, kind] of [
        ["hands", "hands"],
        ["rest", "light-rest"],
        ["speak", "light-speak"],
      ] as const)
        expect(flat).toContain(
          `--mirrors-${name}-${String(k)}: url("art/${kind}-${String(k)}.webp")`,
        );
  });

  it("lays the light in the glass over the frame layer's box exactly, so neighbours' lights stay apart", () => {
    const inset = [
      percent(-VIEW.top / TILE.height),
      percent((VIEW.right - TILE.width) / TILE.width),
      percent((VIEW.bottom - TILE.height) / TILE.height),
    ]
      .map((p) => `-${p}`)
      .join(" ");

    expect(flat).toContain(`inset: ${inset};`);
  });

  it("letters the name where the art leaves it room: under the picture, inside the reach", () => {
    expect(flat).toContain(
      `--mirrors-name-at: ${percent(NAME.y / TILE.height)};`,
    );
    expect(flat).toContain(
      `--mirrors-name-at-cqw: ${String(Math.round((NAME.y / TILE.width) * 10000) / 100)}cqw;`,
    );
  });

  it("lays the level meter over the marks' box above the picture, and shows it only in the cuts", () => {
    const inset = [
      "auto",
      percent(LEVEL.left / TILE.width),
      `calc(100% - ${percent(LEVEL.bottom / TILE.height)})`,
    ].join(" ");

    expect(flat).toContain(`.mav-meter { inset: ${inset};`);
    expect(flat).toContain(
      `height: ${percent(heightOf(LEVEL) / TILE.height)};`,
    );
    expect(widthOf(LEVEL) / TILE.width).toBeCloseTo(
      1 - (2 * LEVEL.left) / TILE.width,
    );
    expect(css).toMatch(
      /\.mav-meter \{[^}]*mask: url\("art\/sigil-mask\.webp"\) 0 0 \/ 100% 100% no-repeat/,
    );
  });

  it("repeats the glass at the size it was rendered for, one whole repeat each way", () => {
    const { glass } = PICTURES;

    expect(flat).toContain(
      `url("art/glass.webp") 0 0 / ${String(glass.width)}px ${String(glass.height)}px`,
    );
  });

  it("cuts the dock's frame and the chips' bezels in nine where they were made to be cut", () => {
    const { dockframe, chip } = PICTURES;

    expect(flat).toContain(
      `border-image: url("art/dockframe.webp") ${String(dockframe.edge * dockframe.density)} / ${String(dockframe.edge)}px round;`,
    );
    expect(flat).toContain(
      `border-image: url("art/chip.webp") ${String(chip.slice)} / ${String(chip.edge)}px;`,
    );
  });

  it("runs the transoms along the dock at the length they were rendered for", () => {
    const h = PICTURES["transom-h"];
    const v = PICTURES["transom-v"];

    expect(flat).toContain(
      `url("art/transom-h.webp") 0 50% / ${String(h.width)}px ${String(h.height)}px repeat-x`,
    );
    expect(flat).toContain(
      `url("art/transom-v.webp") 50% 0 / ${String(v.width)}px ${String(v.height)}px repeat-y`,
    );
  });

  it("raises the contract from the glass's foot, then the quill, each switched on by the room under the cameras", () => {
    const { contract } = PICTURES;

    expect(from("contract")).toBe(FILL.contractFrom);
    expect(from("quill")).toBe(FILL.quillFrom);
    expect(flat).toContain(
      `--mirrors-rise: clamp(0px, (${String(FILL.wholeFrom)} - var(--mav-dock-spare, 0)) * ${String(FILL.sink)}px, ${String(FILL.deepest)}px);`,
    );
    for (const [name, on] of [
      ["quill", "var(--mirrors-quill)"],
      ["contract", "var(--mirrors-contract)"],
    ] as const)
      expect(flat).toContain(
        `url("art/${name}.webp") 50% calc(100% + var(--mirrors-rise)) / calc(${String(contract.width)}px * ${on}) ${String(contract.height)}px no-repeat`,
      );
  });

  it("widens the menu arrow's part to the bezel it was rendered with, and keeps its chevron in the glass", () => {
    const extra = PICTURES["btn-r"].width - PICTURES.btn.width / 2;

    expect(flat).toContain(
      `width: calc(var(--mav-dock-button) / 2 + ${String(extra)}px);`,
    );
  });

  it("loosens the hands' grip of a deafened player, fading them to three fifths", () => {
    expect(css).toMatch(
      /\[data-deafened\]\[data-connected\][^{]*\.mav-dock-tile-frame::before \{[^}]*opacity: 0\.6;/,
    );
  });
});
