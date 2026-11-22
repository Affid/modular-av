// The mirrors theme's rendered pictures: which scene makes which, and the
// size each has to be. They are locked as the scrolls theme's are
// (../scrolls/rendered.ts): rendered.json lists each with its size, weight
// and hash, written by the script that rendered them
// (`pnpm art:mirrors:render`), and a test fails when the files are not the
// ones listed.
import { join } from "node:path";
import { type Picture, rendered, type Size } from "../scrolls/geometry.ts";
import {
  type Manifest,
  readManifest as readListed,
  type Scene,
} from "../scrolls/rendered.ts";
import { FRAME, LIGHT, PANE, PICTURES } from "./geometry.ts";

export {
  describePicture,
  type Manifest,
  parseManifest,
  type Scene,
  staleRendered,
} from "../scrolls/rendered.ts";

export const MANIFEST = join(import.meta.dirname, "rendered.json");
export const SCENE_DIR = join(import.meta.dirname, "render");

/** The two poses of the hands: neighbours in the dock differ. */
export const POSES = [1, 2] as const;

const perPose = (kind: string): readonly string[] =>
  POSES.map((k) => `${kind}-${String(k)}`);

export const SCENES: readonly Scene[] = [
  { script: "glass.py", pictures: ["glass"] },
  {
    script: "silver.py",
    pictures: [
      "dockframe",
      "transom-h",
      "transom-v",
      "btn",
      "btn-l",
      "btn-r",
      "chip",
    ],
  },
  { script: "hands.py", pictures: perPose("hands") },
  {
    script: "light.py",
    pictures: [...perPose("light-rest"), ...perPose("light-speak")],
  },
  { script: "gem.py", pictures: ["gem-stone", "gem-spark", "gem-collet"] },
  { script: "sigils.py", pictures: ["sigil-cut", "sigil-mask", "sigil-shade"] },
  { script: "fog.py", pictures: ["fog"] },
  { script: "crack.py", pictures: ["crack"] },
  { script: "offpane.py", pictures: ["offpane"] },
  { script: "pane.py", pictures: ["pane"] },
  { script: "contract.py", pictures: ["contract"] },
  { script: "quill.py", pictures: ["quill"] },
];

export const renderedNames = (): readonly string[] =>
  SCENES.flatMap((scene) => scene.pictures.map((name) => `${name}.webp`));

/** The size a picture is rendered at, from the theme's measures. */
export function expectedSize(name: string): Size {
  if (!renderedNames().includes(name))
    throw new Error(`${name} is not a picture the scenes render`);
  const base = name.replace(/\.webp$/, "");
  if (base.startsWith("light-")) return LIGHT;
  if (base === "pane") return PANE;
  const own = (PICTURES as Readonly<Record<string, Picture>>)[base];
  return own ? rendered(own) : FRAME;
}

export const readManifest = (file: string = MANIFEST): Promise<Manifest> =>
  readListed(file);
