// The hides theme's pictures: which are drawn here, and keeping the ones
// the module ships (packages/dock-hides/public/art) as this script draws
// them. The rendered ones beside them are locked by rendered.ts.
import { join } from "node:path";
import { staleFiles, writeFiles } from "../vines/files.ts";
import { ROOT } from "../../workspace.ts";
import { drawTally } from "./tally.ts";

export const ART_DIR = join(ROOT, "packages", "dock-hides", "public", "art");

/** Every drawn picture, by file name. */
export const drawnFiles = (): ReadonlyMap<string, string> =>
  new Map([["tally.svg", drawTally()]]);

/** The drawn pictures in `dir` that are missing, changed, or no longer drawn. */
export const staleDrawn = (dir: string): Promise<readonly string[]> =>
  staleFiles(dir, drawnFiles());

/** Writes every drawn picture into `dir` and removes SVG pictures no longer drawn. */
export const writeDrawn = (dir: string): Promise<readonly string[]> =>
  writeFiles(dir, drawnFiles());
