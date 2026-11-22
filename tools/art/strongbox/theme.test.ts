// The theme module and the art agree: the stylesheet names the pictures
// that are made, and both use the measures the art was made to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { heightOf } from "../scrolls/geometry.ts";
import {
  FILL,
  LEVEL,
  LOCKS,
  NAME,
  PICTURES,
  REACH,
  STATES,
  THINGS,
  TILE,
} from "./geometry.ts";
import { renderedNames } from "./rendered.ts";

const THEME = join(ROOT, "packages", "dock-strongbox");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/strongbox.css");
const entry = await read("src/index.ts");
/** The stylesheet with every run of white space as one space and none inside brackets, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
const percent = (share: number): string =>
  `${String(Math.round(share * 10000) / 100)}%`;
/** The free height from which a switch is on: `--sb-<n>: clamp(0, spare - N, 1)` is 1 from N + 1. */
const from = (n: number): number =>
  Number(
    new RegExp(
      `--sb-${String(n)}: clamp\\(0, var\\(--mav-dock-spare, 0\\) - (\\d+), 1\\)`,
    ).exec(flat)?.[1],
  ) + 1;

describe("the strongbox theme", () => {
  it("names every rendered picture in its stylesheet, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("art\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual([...renderedNames()].sort());
  });

  it("registers the reach the windows were rendered for, once", () => {
    expect(entry).toContain(
      `reach: { top: ${String(REACH.top)}, right: ${String(REACH.right)}, bottom: ${String(REACH.bottom)}, left: ${String(REACH.left)} }`,
    );
    // The room round a tile is the reach: the name is stencilled inside it.
    expect(entry).not.toMatch(/\b(room|gridRoom):/);
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("shows a rendered window as its preview", () => {
    const preview = /preview: file\("art\/([^"]+)"\)/.exec(entry)?.[1];

    expect(preview).toBe("frame-shield-rest.webp");
    expect(renderedNames()).toContain(preview);
  });

  it("gives each lock its picture in every state", () => {
    for (const lock of LOCKS)
      for (const state of STATES)
        expect(flat).toContain(
          `--sb-${state}: url("art/frame-${lock}-${state}.webp")`,
        );
  });

  it("stencils the name where the art leaves it room: under the picture, inside the reach", () => {
    expect(flat).toContain(`inset: ${percent(NAME.y / TILE.height)} 0 auto;`);
    expect(flat).toContain(
      `top: calc(50% - ${String(Math.round((NAME.y / TILE.width) * 1000) / 10)}cqw + 5cqw);`,
    );
  });

  it("lays the level meter over the slot's box in the bottom strap, and shows it only through the slot", () => {
    const { fill } = LEVEL;

    expect(flat).toContain(
      `.mav-meter { inset: ${percent(fill.top / TILE.height)} ${percent(fill.left / TILE.width)} auto;`,
    );
    expect(fill.left).toBe(TILE.width - fill.right);
    expect(flat).toContain(`height: ${percent(heightOf(fill) / TILE.height)};`);
    expect(flat).toContain(
      'mask: url("art/level-mask.webp") 0 0 / 100% 100% no-repeat;',
    );
  });

  it("repeats the boards at the size they were rendered for, one whole repeat each way", () => {
    const { ground } = PICTURES;

    expect(flat).toContain(
      `--sb-ground: url("art/ground.webp") 0 0 / ${String(ground.width)}px ${String(ground.height)}px;`,
    );
  });

  it("cuts the strap and the plates in nine where they were made to be cut", () => {
    const { strap, button } = PICTURES;

    expect(flat).toContain(
      `--sb-strap: url("art/strap.webp") ${String(strap.edge * strap.density)} / ${String(strap.edge)}px round;`,
    );
    expect(flat).toContain(
      `--sb-plate: url("art/button.webp") ${String(button.edge * button.density)} fill;`,
    );
    expect(flat).toContain(
      `border-image: var(--sb-plate) / ${String(button.edge)}px stretch;`,
    );
  });

  it("hangs the padlock and the corner brackets at the sizes they were rendered for", () => {
    const { padlock } = PICTURES;
    const bracket = PICTURES["bracket-tl"];

    expect(flat).toMatch(
      new RegExp(
        `width: ${String(padlock.width)}px; height: ${String(padlock.height)}px; background: url\\("art/padlock\\.webp"\\)`,
      ),
    );
    for (const corner of ["tl", "tr", "bl", "br"])
      expect(flat).toContain(
        `url("art/bracket-${corner}.webp") ${corner.endsWith("l") ? "left" : "right"} ${corner.startsWith("t") ? "top" : "bottom"} / ${String(bracket.width)}px ${String(bracket.height)}px`,
      );
  });

  it("wears the stencil with the grain's mask at its own size", () => {
    const { wear } = PICTURES;

    expect(flat).toContain(
      `mask: url("art/wear.webp") 0 0 / ${String(wear.width)}px ${String(wear.height)}px repeat;`,
    );
  });

  it("cuts a scattered window's panel of boards to the frame layer's reach", () => {
    expect(flat).toContain(
      `inset: -${percent((REACH.top * TILE.width) / TILE.height)} -${percent(REACH.left)} -${percent((REACH.bottom * TILE.width) / TILE.height)};`,
    );
    expect(REACH.left).toBe(REACH.right);
  });

  it("brings the things onto the bare boards from the room the measures give, each at its own size", () => {
    expect([1, 2, 3, 4].map(from)).toEqual([
      FILL.knifeFrom,
      FILL.picksFrom,
      FILL.keysFrom,
      FILL.ropeFrom,
    ]);
    expect(flat).toContain(`* ${String(FILL.lift)});`);
    const switches = { knife: 1, picks: 2, keys: 3, grapnel: 4 } as const;
    for (const thing of THINGS) {
      const { width, height } = PICTURES[thing];
      expect(flat).toContain(
        `/ min(${String(width)}px * var(--sb-${String(switches[thing])}), max(0px, (100% - ${String(FILL.across[thing] - 1)}px) * 999)) ${String(height)}px no-repeat`,
      );
      expect(flat).toContain(`url("art/${thing}.webp")`);
    }
  });
});
