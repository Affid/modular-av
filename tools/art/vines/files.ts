// The vines theme's pictures: which files there are, and keeping the ones
// the module ships (packages/dock-vines/public/frames) as the generator
// draws them.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { type BoughSpec, drawBough } from "./bough.ts";
import { drawBranch } from "./branch.ts";
import { drawFrame } from "./frame.ts";
import { type Origin, ORIGINS } from "./geometry.ts";
import { grow } from "./growth.ts";
import { drawKnots, drawLianas } from "./liana.ts";
import { createOutline } from "./outline.ts";
import { paintFoliage, paintVines } from "./paint.ts";
import { drawLoop, drawMeterVine, drawPlate } from "./plate.ts";
import { drawTrunk } from "./trunk.ts";

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

type Named = readonly (readonly [string, string])[];

/** One corner's pictures: its frame and vines, and the lianas it hangs on in a grid. */
function cornerFiles(origin: Origin): Named {
  const seeds = SEEDS[origin];
  const outline = createOutline(seeds.outline);
  const art = drawFrame(outline, seeds.frame);
  const growth = grow(seeds.vines, origin, outline);
  return [
    [`frame-${origin}.svg`, art.frame],
    [`shape-${origin}.svg`, art.shape],
    [`light-${origin}.svg`, art.light],
    [`vines-${origin}-green.svg`, paintVines(growth, "green")],
    [`leaves-${origin}-autumn.svg`, paintFoliage(growth, "autumn")],
    [`vines-${origin}-bare.svg`, paintVines(growth, "bare")],
    [`hang-${origin}.svg`, drawLianas(outline, origin, "tied")],
    [`loose-${origin}.svg`, drawLianas(outline, origin, "loose")],
    [`loose-short-${origin}.svg`, drawLianas(outline, origin, "short")],
    [`knots-${origin}.svg`, drawKnots(outline, origin)],
  ];
}

/**
 * The four boughs off the trunk: a lesser one over the header and a main
 * one under it, which the cameras hang from; a main one over the voice
 * panel and a lesser one under it. Each curls round its board's corner.
 */
const BOUGHS: Readonly<Record<string, BoughSpec>> = {
  top: {
    seed: 5,
    thick: false,
    curl: "down",
    leaves: { above: 30, below: 40 },
  },
  header: {
    seed: 12,
    thick: true,
    curl: "up",
    leaves: { above: 34, below: 70 },
  },
  panel: {
    seed: 23,
    thick: true,
    curl: "down",
    leaves: { above: 70, below: 30 },
  },
  foot: { seed: 31, thick: false, curl: "up" },
};

/** The dock's own plant, and what a name hangs on. */
function plantFiles(): Named {
  return [
    ["trunk.svg", drawTrunk(71, "down")],
    ["trunk-across.svg", drawTrunk(71, "across")],
    ...Object.entries(BOUGHS).map(
      ([name, spec]) => [`bough-${name}.svg`, drawBough(spec)] as const,
    ),
    ["branch-small.svg", drawBranch("small")],
    ["branch-medium.svg", drawBranch("medium")],
    ["branch-large.svg", drawBranch("large")],
    ["plate.svg", drawPlate(4)],
    ["loop.svg", drawLoop(5)],
    ["meter.svg", drawMeterVine()],
  ];
}

/** Every picture, by file name. */
export function artFiles(): ReadonlyMap<string, string> {
  return new Map([...ORIGINS.flatMap(cornerFiles), ...plantFiles()]);
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
