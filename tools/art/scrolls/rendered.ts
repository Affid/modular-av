// The theme's rendered pictures. They are made by Blender from the scenes
// in render/ (`pnpm art:scrolls:render`), which no test can run: a render
// needs Blender and its result differs a little from machine to machine.
// So the shipped pictures are locked instead: rendered.json lists each
// with its size, weight and hash, written by the script that rendered
// them, and a test fails when the files are not the ones listed.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  heightOf,
  type Picture,
  PICTURES,
  rendered,
  type Size,
  VIEW,
  widthOf,
} from "./geometry.ts";
import { webpSize } from "./webp.ts";

export interface Rendered extends Size {
  readonly bytes: number;
  readonly sha256: string;
}

/** Each shipped picture, by file name. */
export type Manifest = Readonly<Record<string, Rendered>>;

export const MANIFEST = join(import.meta.dirname, "rendered.json");
export const SCENE_DIR = join(import.meta.dirname, "render");

export interface Scene {
  /** The scene's script in render/. */
  readonly script: string;
  /** The pictures it writes, without their extension. */
  readonly pictures: readonly string[];
}

const SCROLLS = [1, 2] as const;

export const SCENES: readonly Scene[] = [
  { script: "desk.py", pictures: ["desk"] },
  { script: "scroll.py", pictures: SCROLLS.map((k) => `scroll-${k}`) },
  {
    script: "stones.py",
    pictures: SCROLLS.flatMap((k) =>
      ["stones", "shadow", "spark", "glow"].map((kind) => `${kind}-${k}`),
    ),
  },
  { script: "plate.py", pictures: ["plate"] },
  { script: "paper.py", pictures: ["paper"] },
  { script: "things.py", pictures: ["things"] },
  { script: "wand.py", pictures: ["wand"] },
];

export const renderedNames = (): readonly string[] =>
  SCENES.flatMap((scene) => scene.pictures.map((name) => `${name}.webp`));

/** A picture that fills the frame layer: a pixel to a tile unit. */
const FRAME: Size = {
  width: Math.floor(widthOf(VIEW)),
  height: Math.floor(heightOf(VIEW)),
};

/** The size a picture is rendered at, from the theme's measures. */
export function expectedSize(name: string): Size {
  if (!renderedNames().includes(name))
    throw new Error(`${name} is not a picture the scenes render`);
  const own = (PICTURES as Readonly<Record<string, Picture>>)[
    name.replace(/\.webp$/, "")
  ];
  return own ? rendered(own) : FRAME;
}

export const describePicture = (bytes: Uint8Array): Rendered => ({
  ...webpSize(bytes),
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

const isRendered = (value: unknown): value is Rendered => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    [entry.width, entry.height, entry.bytes].every(
      (n) => typeof n === "number" && Number.isInteger(n) && n > 0,
    ) &&
    typeof entry.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(entry.sha256)
  );
};

export function parseManifest(text: string): Manifest {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("The manifest of rendered pictures must be an object");
  for (const [name, entry] of Object.entries(parsed)) {
    if (!/^[\w-]+\.webp$/.test(name))
      throw new Error(`${JSON.stringify(name)} is not a picture's file name`);
    if (!isRendered(entry))
      throw new Error(`${name} needs a width, a height, bytes and a sha256`);
  }
  return parsed as Manifest;
}

export const readManifest = async (
  file: string = MANIFEST,
): Promise<Manifest> => parseManifest(await readFile(file, "utf8"));

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

async function describeFile(file: string): Promise<Rendered | null> {
  try {
    return describePicture(await readFile(file));
  } catch (error: unknown) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function webpIn(dir: string): Promise<readonly string[]> {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(".webp"));
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** The pictures that are missing from `dir` or not the ones listed, and the WebP files there that aren't listed. */
export async function staleRendered(
  dir: string,
  manifest: Manifest,
): Promise<readonly string[]> {
  const differing = await Promise.all(
    Object.entries(manifest).map(async ([name, listed]) => {
      const found = await describeFile(join(dir, name));
      return found?.sha256 === listed.sha256 ? [] : [name];
    }),
  );
  const strays = (await webpIn(dir)).filter((name) => !(name in manifest));
  return [...differing.flat(), ...strays].sort();
}
