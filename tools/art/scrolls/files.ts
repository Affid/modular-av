// the scrolls theme's pictures: which are drawn here, and keeping the ones
// the module ships (packages/dock-scrolls/public/art) as this script draws
// them. The rendered ones beside them are locked by rendered.ts.
import { join } from "node:path";
import { staleFiles, writeFiles } from "../vines/files.ts";
import { ROOT } from "../../workspace.ts";
import { drawButton } from "./buttons.ts";
import { drawCracks } from "./cracks.ts";
import { STONES } from "./geometry.ts";
import { drawWriting, WRITINGS } from "./ink.ts";

export const ART_DIR = join(ROOT, "packages", "dock-scrolls", "public", "art");

type Named = readonly (readonly [string, string])[];

/** One hand's writing, numbered from 1. */
function writingFiles(hand: number): Named {
  const { ink, signs, halo } = drawWriting(hand);
  const number = hand + 1;
  return [
    [`ink-${number}.svg`, ink],
    [`signs-${number}.svg`, signs],
    [`halo-${number}.svg`, halo],
  ];
}

/** Every drawn picture, by file name. */
export function drawnFiles(): ReadonlyMap<string, string> {
  return new Map([
    ...Array.from({ length: WRITINGS }, (_, hand) => hand).flatMap(
      writingFiles,
    ),
    ...STONES.map(
      (_, scroll) => [`cracks-${scroll + 1}.svg`, drawCracks(scroll)] as const,
    ),
    ["button.svg", drawButton("whole")],
    ["button-left.svg", drawButton("left")],
    ["button-right.svg", drawButton("right")],
  ]);
}

/** The drawn pictures in `dir` that are missing, changed, or no longer drawn. */
export const staleDrawn = (dir: string): Promise<readonly string[]> =>
  staleFiles(dir, drawnFiles());

/** Writes every drawn picture into `dir` and removes SVG pictures no longer drawn. */
export const writeDrawn = (dir: string): Promise<readonly string[]> =>
  writeFiles(dir, drawnFiles());
