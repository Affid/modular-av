// The theme module and the art agree: the stylesheet names the pictures
// that are made, and both use the measures the art was made to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../workspace.ts";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import { FILL, METER, PICTURES, READOUT, REACH, STATES } from "./geometry.ts";
import { renderedNames } from "./rendered.ts";

const THEME = join(ROOT, "packages", "dock-spaceship");
const read = (path: string): Promise<string> =>
  readFile(join(THEME, path), "utf8");
const css = await read("public/spaceship.css");
const entry = await read("src/index.ts");
const pkg = JSON.parse(await read("package.json")) as {
  modularAV: { downloads: Record<string, { url: string; sha256: string }> };
};
/** The stylesheet with every run of white space as one space and none inside brackets, to look for a declaration however it is wrapped. */
const flat = css.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
/** Tile units as the container's units: the tile is 1000 wide, 100cqw. */
const cqw = (units: number): string =>
  `${String(Math.round(units * 10) / 100)}cqw`;
/** The free height from which a switch is on: `--ship-s<n>: clamp(0, spare - N, 1)` is 1 from N + 1. */
const from = (n: number): number =>
  Number(
    new RegExp(
      `--ship-s${String(n)}: clamp\\(0, var\\(--mav-dock-spare, 0\\) - (\\d+), 1\\)`,
    ).exec(flat)?.[1],
  ) + 1;

describe("the spaceship theme", () => {
  it("names every rendered picture in its stylesheet, and no other", () => {
    const named = new Set(
      [...css.matchAll(/url\("art\/([^"]+)"\)/g)].map((m) => m[1]),
    );

    expect([...named].sort()).toEqual([...renderedNames()].sort());
  });

  it("registers the reach the monitors were rendered for, once", () => {
    expect(entry).toContain(
      `reach: { top: ${String(REACH.top)}, right: ${String(REACH.right)}, bottom: ${String(REACH.bottom)}, left: ${String(REACH.left)} }`,
    );
    expect(entry.match(/\.register\(/g)).toHaveLength(1);
    // The room round a tile is the reach: the readout is inside it.
    expect(entry).not.toMatch(/\b(room|gridRoom):/);
    expect(css).not.toMatch(/--mav-dock-(frame|room)-\w+:/);
  });

  it("shows a rendered monitor as its preview", () => {
    const preview = /preview: file\("art\/([^"]+)"\)/.exec(entry)?.[1];

    expect(preview).toBe("monitor-rest.webp");
    expect(renderedNames()).toContain(preview);
  });

  it("gives the other players' monitors and your own a picture in every state", () => {
    for (const state of STATES) {
      expect(flat).toContain(`url("art/monitor-${state}.webp")`);
      expect(flat).toContain(`url("art/own-${state}.webp")`);
    }
  });

  it("lays the name's bar exactly on the readout's window, and the unlit segments with it", () => {
    const { window } = READOUT;
    const pad = 1.5;

    expect(flat).toContain(`height: ${cqw(heightOf(window))};`);
    expect(flat).toContain(`margin: ${cqw(window.top)} ${cqw(window.left)} 0;`);
    expect(flat).toContain(`padding: 0 ${String(pad)}cqw;`);
    expect(flat).toContain(`top: ${cqw(window.top)};`);
    expect(flat).toContain(`left: ${String(window.left / 10 + pad)}cqw;`);
    // What the name slides within: the window less the padding at both ends.
    const inside = widthOf(window) / 10 - 2 * pad;
    expect(flat).toContain(`--ship-window: ${String(inside)}cqw;`);
    expect(flat).toContain(`width: ${String(inside)}cqw;`);
  });

  it("stands your level in its window in the case's right side", () => {
    const middle = (METER.top + METER.bottom) / 2;

    expect(flat).toContain(`--ship-meter-across: ${cqw(METER.across)};`);
    expect(flat).toContain(
      `top: calc(${cqw(middle)} - var(--ship-meter-across) / 2);`,
    );
    expect(flat).toContain(
      `left: calc(${cqw(METER.x)} - var(--ship-meter-length) / 2);`,
    );
    const length = Number(/--ship-meter-length: ([\d.]+)cqw;/.exec(flat)?.[1]);
    expect(length * 10).toBeLessThan(METER.bottom - METER.top);
    expect(length * 10).toBeGreaterThan(METER.bottom - METER.top - 20);
  });

  it("repeats the bulkhead and the plates' paint at the size they were rendered for", () => {
    const { bulkhead, plate, grime } = PICTURES;

    expect(flat).toContain(
      `var(--ship-wall) 0 0 / ${String(bulkhead.width)}px ${String(bulkhead.height)}px`,
    );
    expect(flat).toContain(
      `var(--ship-plate) 0 0 / ${String(plate.width)}px ${String(plate.height)}px`,
    );
    expect(flat).toContain(
      `var(--ship-grime) left 0 bottom -3px / ${String(grime.width)}px ${String(grime.height)}px repeat-x`,
    );
  });

  it("cuts the angle steel, the plates' rims, the keys and the arrows in nine where they were made to be cut", () => {
    const slice = (name: keyof typeof PICTURES): string => {
      const own = PICTURES[name] as { edge: number; density: number };
      return String(own.edge * own.density);
    };
    const { trim, key, arrow } = PICTURES;
    const rim = PICTURES["plate-rim"];

    expect(flat).toContain(
      `--ship-trim: url("art/trim.webp") ${slice("trim")} / ${String(trim.edge)}px / 4px round;`,
    );
    expect(flat).toContain(
      `--ship-rim: url("art/plate-rim.webp") ${slice("plate-rim")} / ${String(rim.edge)}px / 4px round;`,
    );
    expect(flat).toContain(
      `border-image: var(--ship-key-now) ${slice("key")} fill / ${String(key.edge)}px / 2px stretch;`,
    );
    expect(flat).toContain(`border-image-slice: ${slice("arrow")} fill;`);
    expect(flat).toContain(`border-image-width: ${String(arrow.edge)}px;`);
  });

  it("cuts the annunciators, the tile's keys and the floating grip where their pictures were made to be cut", () => {
    const { key } = PICTURES;
    const lens = PICTURES["annunciator-amber"];

    expect(flat).toContain(
      `url("art/annunciator-amber.webp") ${String(lens.edge * lens.density)} fill / ${String(lens.edge)}px / 2px stretch;`,
    );
    // The tile's keys and the grip are the panel's key drawn smaller: the same slice, a narrower edge.
    expect(flat).toContain(
      `border-image: url("art/key-rest.webp") ${String(key.edge * key.density)} fill / 10px / 1px stretch;`,
    );
    expect(flat).toContain(
      `border-image: url("art/key-rest.webp") ${String(key.edge * key.density)} fill / 8px / 0 stretch;`,
    );
  });

  it("hangs the lamp and the stencilled marking at the sizes they were rendered for", () => {
    const lamp = PICTURES["lamp-off"];
    const { legend } = PICTURES;

    expect(flat).toContain(
      `width: ${String(lamp.width)}px; height: ${String(lamp.height)}px; margin: -8px 1px -8px 0;`,
    );
    expect(flat).toContain(
      `width: ${String(legend.width)}px; height: ${String(legend.height)}px;`,
    );
  });

  it("brings the wall's things in from the room the measures give, each at its own size", () => {
    expect([1, 2, 3, 4].map(from)).toEqual([
      FILL.tapeFrom,
      FILL.wrenchFrom,
      FILL.clipboardFrom,
      FILL.extinguisherFrom,
    ]);
    expect(flat).toContain(
      `--ship-need: calc(${String(FILL.tapeFrom)} * var(--ship-a) + ${String(FILL.wrenchFrom)} * var(--ship-b) + ${String(FILL.clipboardFrom)} * var(--ship-c) + ${String(FILL.extinguisherFrom)} * var(--ship-d));`,
    );
    const switches = {
      tape: 1,
      wrench: 2,
      clipboard: 3,
      extinguisher: 4,
    } as const;
    for (const [thing, n] of Object.entries(switches)) {
      const { width, height } = PICTURES[thing as keyof typeof switches];
      expect(flat).toMatch(
        new RegExp(
          `(calc|min)\\(${String(width)}px \\* var\\(--ship-s${String(n)}\\)[^/]*? ${String(height)}px no-repeat`,
        ),
      );
    }
    const { rail } = PICTURES;
    expect(flat).toContain(
      `calc(${String(rail.width)}px * var(--ship-s2)) ${String(rail.height)}px no-repeat`,
    );
  });

  it("leaves out what hangs in the right-hand column in a dock too narrow for it, rather than cutting it off", () => {
    const right = "max(0px, (100% - var(--ship-right)) * 999)";

    expect(flat).toContain("--ship-right: 291px;");
    const { tape, rail } = PICTURES;
    for (const [width, on] of [
      [tape.width, "s1"],
      [rail.width, "s1"],
      [rail.width, "d"],
    ] as const)
      expect(flat).toContain(
        `min(${String(width)}px * var(--ship-${on}), ${right})`,
      );
    for (const side of ["wrench-k", "clip-k"])
      expect(flat).toContain(
        `max(0px, (100% - var(--ship-right) * var(--ship-${side})) * 999)`,
      );
  });

  it("reads its readout's font from the file the build fetches, pinned, under the font's own licence", () => {
    expect(flat).toContain(
      'src: url("fonts/DSEG14Classic-Regular.woff2") format("woff2");',
    );
    const font = pkg.modularAV.downloads["fonts/DSEG14Classic-Regular.woff2"];
    const licence = pkg.modularAV.downloads["fonts/DSEG-LICENSE.txt"];

    expect(font?.url).toBe("https://registry.npmjs.org/dseg/-/dseg-0.46.0.tgz");
    expect(font?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(licence?.url).toBe(font?.url);
    expect(licence?.sha256).toBe(font?.sha256);
  });
});
