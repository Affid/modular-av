// The vines theme's pictures: which files there are, and keeping the ones
// the module ships (packages/dock-vines/public/frames) as the generator
// draws them.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { wovenFrame } from "./frame.ts";
import { type Origin, ORIGINS } from "./geometry.ts";
import { grow } from "./growth.ts";
import { paintFoliage, paintVines } from "./paint.ts";

export const ART_DIR = join(ROOT, "packages", "dock-vines", "public", "frames");

/** Each corner's own vines: chosen by eye, for vines that fill their corner. */
const SEEDS: Readonly<Record<Origin, number>> = {
  tl: 11,
  tr: 23,
  bl: 37,
  br: 53,
};

/** Every picture, by file name. */
export function artFiles(): ReadonlyMap<string, string> {
  return new Map([
    ["frame.svg", wovenFrame()],
    ...ORIGINS.flatMap((origin): readonly (readonly [string, string])[] => {
      const growth = grow(SEEDS[origin], origin);
      return [
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
