// The plates theme's rendered pictures: which scene makes which, and the
// size each has to be. They are locked as the scrolls theme's are
// (../scrolls/rendered.ts): rendered.json lists each with its size, weight
// and hash, written by the script that rendered them
// (`pnpm art:plates:render`), and a test fails when the files are not the
// ones listed.
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
import { FRAME, LEVEL, PICTURES, VIEW } from "./geometry.ts";

export {
  describePicture,
  type Manifest,
  parseManifest,
  type Scene,
  staleRendered,
} from "../scrolls/rendered.ts";

export const MANIFEST = join(import.meta.dirname, "rendered.json");
export const SCENE_DIR = join(import.meta.dirname, "render");

/** The two plates: neighbours in the dock differ. */
export const PLATES = [1, 2] as const;

/** What a plate's scene makes of it: at rest, polished by a voice, rusted out of the call, and its cord whole and lost. */
const OF_A_PLATE = [
  "plate",
  "plate-polished",
  "plate-out",
  "cord",
  "cord-out",
] as const;

export const SCENES: readonly Scene[] = [
  { script: "mail.py", pictures: ["mail"] },
  {
    script: "plate.py",
    pictures: PLATES.flatMap((k) =>
      OF_A_PLATE.map((kind) => `${kind}-${String(k)}`),
    ),
  },
  { script: "knife.py", pictures: ["knife", "blade"] },
  { script: "lame.py", pictures: ["lame", "steel"] },
  {
    script: "tab.py",
    pictures: ["tab-1", "tab-2", "tab-left", "tab-right"],
  },
  { script: "mace.py", pictures: ["mace"] },
  { script: "gauntlets.py", pictures: ["gauntlets"] },
  { script: "buckler.py", pictures: ["buckler"] },
];

export const renderedNames = (): readonly string[] =>
  SCENES.flatMap((scene) => scene.pictures.map((name) => `${name}.webp`));

/** The blade alone: the level's box, in a frame picture's pixels. */
const BLADE: Size = {
  width: (widthOf(LEVEL) * FRAME.width) / widthOf(VIEW),
  height: (heightOf(LEVEL) * FRAME.width) / widthOf(VIEW),
};

/** The size a picture is rendered at, from the theme's measures. */
export function expectedSize(name: string): Size {
  if (!renderedNames().includes(name))
    throw new Error(`${name} is not a picture the scenes render`);
  if (name === "blade.webp") return BLADE;
  const own = (PICTURES as Readonly<Record<string, Picture>>)[
    name.replace(/\.webp$/, "")
  ];
  return own ? rendered(own) : FRAME;
}

export const readManifest = (file: string = MANIFEST): Promise<Manifest> =>
  readListed(file);
