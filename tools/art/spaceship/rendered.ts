// The spaceship theme's rendered pictures: which scene makes which, and the
// size each has to be. They are locked as the scrolls theme's are
// (../scrolls/rendered.ts): rendered.json lists each with its size, weight
// and hash, written by the script that rendered them
// (`pnpm art:spaceship:render`), and a test fails when the files are not
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
import { FRAME, PICTURES, READOUT, STATES } from "./geometry.ts";
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

/** The keys' faces: at rest, with an LED of a colour, held down with it lit, and the red hang-up key. */
const KEYS = [
  "key-rest",
  ...["red", "green", "amber"].flatMap((led) => [
    `key-led-${led}`,
    `key-down-${led}`,
  ]),
  "key-leave",
] as const;
const ARROWS = ["arrow", "arrow-down"] as const;
const hovered = (names: readonly string[]): string[] =>
  names.flatMap((name) => [name, `${name}-hover`]);

export const SCENES: readonly Scene[] = [
  { script: "wall.py", pictures: ["bulkhead"] },
  {
    script: "frames.py",
    pictures: [
      ...STATES.map((state) => `monitor-${state}`),
      ...STATES.map((state) => `own-${state}`),
      "readout-rest",
      "readout-speak",
      "colour-tape",
    ],
  },
  {
    script: "screens.py",
    pictures: [
      "scan",
      "scan-deaf",
      "scan-deaf-own",
      "snow",
      "snow-deaf",
      "snow-deaf-own",
    ],
  },
  {
    script: "plates.py",
    pictures: [
      "plate",
      "plate-rim",
      "plate-rim-plain",
      "grime",
      "trim",
      "legend",
    ],
  },
  {
    script: "lamps.py",
    pictures: [
      "lamp-off",
      "lamp-green",
      "lamp-amber",
      "lamp-red",
      "annunciator-amber",
      "annunciator-red",
    ],
  },
  { script: "keys.py", pictures: [...hovered(KEYS), ...hovered(ARROWS)] },
  {
    script: "things.py",
    pictures: ["extinguisher", "clipboard", "wrench", "tape", "rail"],
  },
];

export const renderedNames = (): readonly string[] =>
  SCENES.flatMap((scene) => scene.pictures.map((name) => `${name}.webp`));

/** The readout's window at the frame's density. */
const windowSize = (): Size => ({
  width: Math.round(widthOf(READOUT.window) * measures.frameDensity),
  height: Math.round(heightOf(READOUT.window) * measures.frameDensity),
});

/** Which entry of the measures gives a picture its size: the keys and arrows share theirs. */
const sizedBy = (base: string): string =>
  base.startsWith("key-") ? "key" : base.startsWith("arrow") ? "arrow" : base;

/** The size a picture is rendered at, from the theme's measures. */
export function expectedSize(name: string): Size {
  if (!renderedNames().includes(name))
    throw new Error(`${name} is not a picture the scenes render`);
  const base = name.replace(/\.webp$/, "");
  if (base.startsWith("readout-")) return windowSize();
  const own = (PICTURES as Readonly<Record<string, Picture>>)[sizedBy(base)];
  return own ? rendered(own) : FRAME;
}

/**
 * The plates' paint is fine grain and scratches over one flat tone: at the
 * render script's usual quality they smear into a plain grey. It is shipped
 * at 0.97, as the settled look was (27 KB); everything else at the usual.
 */
export const qualityOf = (name: string): number | undefined =>
  name === "plate.webp" ? 0.97 : undefined;

export const readManifest = (file: string = MANIFEST): Promise<Manifest> =>
  readListed(file);
