// The hides theme's rendered pictures: which scene makes which, and the
// size each has to be. They are locked as the scrolls theme's are
// (../scrolls/rendered.ts): rendered.json lists each with its size, weight
// and hash, written by the script that rendered them
// (`pnpm art:hides:render`), and a test fails when the files are not the
// ones listed.
import { join } from "node:path";
import { type Picture, rendered, type Size } from "../scrolls/geometry.ts";
import {
  type Manifest,
  readManifest as readListed,
  type Scene,
} from "../scrolls/rendered.ts";
import { FRAME, PICTURES } from "./geometry.ts";

export {
  describePicture,
  type Manifest,
  parseManifest,
  type Scene,
  staleRendered,
} from "../scrolls/rendered.ts";

export const MANIFEST = join(import.meta.dirname, "rendered.json");
export const SCENE_DIR = join(import.meta.dirname, "render");

/** The two hides: neighbours in the dock differ. */
export const HIDES = [1, 2] as const;

export const SCENES: readonly Scene[] = [
  { script: "wall.py", pictures: ["wall"] },
  {
    script: "hide.py",
    pictures: HIDES.flatMap((k) =>
      ["hide", "hide-cut", "light", "paint"].map(
        (kind) => `${kind}-${String(k)}`,
      ),
    ),
  },
  { script: "tag.py", pictures: ["tag"] },
  { script: "piece.py", pictures: ["piece", "leather"] },
  { script: "stud.py", pictures: ["stud", "stud-left", "stud-right"] },
  { script: "skull.py", pictures: ["skull"] },
];

export const renderedNames = (): readonly string[] =>
  SCENES.flatMap((scene) => scene.pictures.map((name) => `${name}.webp`));

/** The size a picture is rendered at, from the theme's measures. */
export function expectedSize(name: string): Size {
  if (!renderedNames().includes(name))
    throw new Error(`${name} is not a picture the scenes render`);
  const own = (PICTURES as Readonly<Record<string, Picture>>)[
    name.replace(/\.webp$/, "")
  ];
  return own ? rendered(own) : FRAME;
}

export const readManifest = (file: string = MANIFEST): Promise<Manifest> =>
  readListed(file);
