// The strongbox theme's rendered pictures: which scene makes which, and the
// size each has to be. They are locked as the scrolls theme's are
// (../scrolls/rendered.ts): rendered.json lists each with its size, weight
// and hash, written by the script that rendered them
// (`pnpm art:strongbox:render`), and a test fails when the files are not
// the ones listed.
import { join } from "node:path";
import {
  heightOf,
  type Picture,
  rendered,
  type Size,
  widthOf,
} from "../scrolls/geometry.ts";
import {
  type Manifest,
  readManifest as readListed,
  type Scene,
} from "../scrolls/rendered.ts";
import { FRAME, LEVEL, LOCKS, PICTURES, STATES } from "./geometry.ts";
import measures from "./measures.json" with { type: "json" };

export {
  describePicture,
  type Manifest,
  parseManifest,
  type Scene,
  staleRendered,
} from "../scrolls/rendered.ts";

export const MANIFEST = join(import.meta.dirname, "rendered.json");
export const SCENE_DIR = join(import.meta.dirname, "render");

export const SCENES: readonly Scene[] = [
  { script: "ground.py", pictures: ["ground"] },
  { script: "strap.py", pictures: ["strap"] },
  {
    script: "frames.py",
    pictures: LOCKS.flatMap((lock) =>
      STATES.map((state) => `frame-${lock}-${state}`),
    ),
  },
  { script: "level.py", pictures: ["level", "level-mask", "level-fill"] },
  {
    script: "parts.py",
    pictures: [
      "button",
      "button-pressed",
      "padlock",
      "bracket-tl",
      "bracket-tr",
      "bracket-bl",
      "bracket-br",
      "wear",
    ],
  },
  { script: "lining.py", pictures: ["lining"] },
  { script: "things.py", pictures: ["knife", "picks", "keys", "grapnel"] },
];

export const renderedNames = (): readonly string[] =>
  SCENES.flatMap((scene) => scene.pictures.map((name) => `${name}.webp`));

/** A box of the tile at `density` pixels to a tile unit. */
const boxAt = (density: number): Size => ({
  width: Math.round(widthOf(LEVEL.fill) * density),
  height: Math.round(heightOf(LEVEL.fill) * density),
});

/** The size a picture is rendered at, from the theme's measures. */
export function expectedSize(name: string): Size {
  if (!renderedNames().includes(name))
    throw new Error(`${name} is not a picture the scenes render`);
  const base = name.replace(/\.webp$/, "");
  if (base === "level-fill") return boxAt(measures.frameDensity);
  if (base === "level-mask") return boxAt(LEVEL.maskDensity);
  const own = (PICTURES as Readonly<Record<string, Picture>>)[base];
  return own ? rendered(own) : FRAME;
}

export const readManifest = (file: string = MANIFEST): Promise<Manifest> =>
  readListed(file);
