// The vines theme's pictures: which files there are, and keeping the ones
// the module ships (packages/dock-vines/public/frames) as the generator
// draws them.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { drawFrame } from "./frame.ts";
import { GRID_VIEW, type Origin, ORIGINS } from "./geometry.ts";
import { grow } from "./growth.ts";
import { drawLattice } from "./lattice.ts";
import { createOutline } from "./outline.ts";
import { paintFoliage, paintVines } from "./paint.ts";

export const ART_DIR = join(ROOT, "packages", "dock-vines", "public", "frames");

/**
 * Each corner's own frame and vines: its outline, its branches and its
 * ivy, chosen by eye for frames that differ and vines that fill their corner.
 */
const SEEDS: Readonly<
  Record<Origin, { outline: number; frame: number; vines: number }>
> = {
  tl: { outline: 9, frame: 109, vines: 11 },
  tr: { outline: 4, frame: 104, vines: 23 },
  bl: { outline: 17, frame: 117, vines: 37 },
  br: { outline: 31, frame: 131, vines: 53 },
};

/** Every picture, by file name. */
export function artFiles(): ReadonlyMap<string, string> {
  return new Map([
    ["lattice.svg", drawLattice()],
    ...ORIGINS.flatMap((origin): readonly (readonly [string, string])[] => {
      const seeds = SEEDS[origin];
      const outline = createOutline(seeds.outline);
      const art = drawFrame(outline, seeds.frame);
      const growth = grow(seeds.vines, origin, outline);
      // The same plant where cameras share a lattice: it has less room there.
      const onLattice = grow(seeds.vines, origin, "lattice");
      return [
        [
          `grid-vines-${origin}-green.svg`,
          paintVines(onLattice, "green", GRID_VIEW),
        ],
        [
          `grid-leaves-${origin}-autumn.svg`,
          paintFoliage(onLattice, "autumn", GRID_VIEW),
        ],
        [
          `grid-vines-${origin}-bare.svg`,
          paintVines(onLattice, "bare", GRID_VIEW),
        ],
        [`frame-${origin}.svg`, art.frame],
        [`shape-${origin}.svg`, art.shape],
        [`light-${origin}.svg`, art.light],
        [`vines-${origin}-green.svg`, paintVines(growth, "green")],
        [`leaves-${origin}-autumn.svg`, paintFoliage(growth, "autumn")],
        [`vines-${origin}-bare.svg`, paintVines(growth, "bare")],
      ];
    }),
  ]);
}

/** `fallback` when the file or folder isn't there; any other failure stands. */
const unlessMissing =
  <T>(fallback: T) =>
  (error: unknown): T => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return fallback;
    throw error;
  };

const picturesIn = async (dir: string): Promise<readonly string[]> => {
  const names = await readdir(dir).catch(unlessMissing<readonly string[]>([]));
  return names.filter((name) => name.endsWith(".svg"));
};

/** The pictures in `dir` that are missing, changed, or no longer drawn. */
export async function staleArt(dir: string): Promise<readonly string[]> {
  const files = artFiles();
  const strays = (await picturesIn(dir)).filter((name) => !files.has(name));
  const differing = await Promise.all(
    [...files].map(async ([name, text]) => {
      const onDisk = await readFile(join(dir, name), "utf8").catch(
        unlessMissing(undefined),
      );
      return onDisk === text ? [] : [name];
    }),
  );
  return [...differing.flat(), ...strays];
}

/** Writes every picture into `dir` and removes pictures no longer drawn. */
export async function writeArt(dir: string): Promise<readonly string[]> {
  const files = artFiles();
  await mkdir(dir, { recursive: true });
  const strays = (await picturesIn(dir)).filter((name) => !files.has(name));
  await Promise.all(strays.map((name) => rm(join(dir, name))));
  await Promise.all(
    [...files].map(([name, text]) => writeFile(join(dir, name), text)),
  );
  return [...files.keys()];
}
