// Renders a theme's pictures with Blender and lists them in the theme's
// rendered.json, which locks what its module ships. The scrolls and the
// hides themes each call it with their scenes (scrolls-render.ts,
// hides-render.ts).
//
// Needs Blender 4.5 or later: BLENDER names its program; without it, the
// one Windows has when this runs under WSL, or `blender` on the path. A
// render is not the same to the bit on every machine: look at what changed
// before committing it.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { Size } from "../../tools/art/scrolls/geometry.ts";
import {
  describePicture,
  type Manifest,
  parseManifest,
  type Scene,
} from "../../tools/art/scrolls/rendered.ts";

/** What a theme gives to have its pictures rendered. */
export interface RenderedTheme {
  /** For the scratch folder's name. */
  readonly name: string;
  /** Where the scenes' scripts are, and each with the pictures it writes. */
  readonly sceneDir: string;
  readonly scenes: readonly Scene[];
  /** The module's folder of pictures, and the list that locks them. */
  readonly artDir: string;
  readonly manifest: string;
  /** The size a picture has to be, by its file name. */
  expectedSize(name: string): Size;
  /** Fetches what the scenes read; the folder it is in. */
  fetchTextures(): Promise<string>;
  /** Puts what the scenes need beside their pictures before they run, e.g. a drawn mask as pixels. */
  prepare?(out: string): Promise<void>;
  /** The encoder's quality for a picture whose fine grain the usual one smears, by its file name. */
  quality?(name: string): number | undefined;
}

const WINDOWS_BLENDER =
  "/mnt/c/Program Files/Blender Foundation/Blender 4.5/blender.exe";
const BLENDER =
  process.env.BLENDER ??
  (existsSync(WINDOWS_BLENDER) ? WINDOWS_BLENDER : "blender");
/** A Windows program under WSL is given Windows paths. */
const FOR_WINDOWS = process.platform === "linux" && BLENDER.endsWith(".exe");
/** The WebP encoder's quality: the pictures' edges stay clean. */
const QUALITY = 0.86;

const pathFor = (path: string): string =>
  FOR_WINDOWS
    ? execFileSync("wslpath", ["-w", path], { encoding: "utf8" }).trim()
    : path;

function chosenScenes(
  all: readonly Scene[],
  names: readonly string[],
): readonly Scene[] {
  if (names.length === 0) return all;
  const known = all.map((scene) => scene.script.replace(/\.py$/, ""));
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0)
    throw new Error(
      `No scene called ${unknown.join(", ")}: there are ${known.join(", ")}`,
    );
  return all.filter((scene) =>
    names.includes(scene.script.replace(/\.py$/, "")),
  );
}

/** Blender says a line for every step of a render: room for all of a scene's. */
const OUTPUT_LIMIT = 64 * 1024 * 1024;
/** How much of what Blender said goes into an error. */
const TAIL = 2000;

/** Runs one scene; its pictures are PNG files in `out` afterwards. */
function renderScene(
  theme: RenderedTheme,
  scene: Scene,
  out: string,
  textures: string,
): void {
  console.log(`Rendering ${scene.script}`);
  const run = spawnSync(
    BLENDER,
    [
      "--background",
      "--factory-startup",
      "--python-exit-code",
      "1",
      "--python",
      pathFor(join(theme.sceneDir, scene.script)),
      "--",
      "--out",
      pathFor(out),
      "--textures",
      pathFor(textures),
    ],
    { encoding: "utf8", maxBuffer: OUTPUT_LIMIT },
  );
  // Blender never started (not installed, or BLENDER names nothing): it said nothing.
  if (run.error)
    throw new Error(
      `${scene.script}: Blender didn't run (${run.error.message}). BLENDER names its program; now it is ${BLENDER}`,
      { cause: run.error },
    );
  const missing = scene.pictures.filter(
    (name) => !existsSync(join(out, `${name}.png`)),
  );
  if (run.status !== 0 || missing.length > 0)
    throw new Error(
      `${scene.script} failed (exit ${String(run.status)}${missing.length > 0 ? `, no ${missing.join(", ")}` : ""}):\n${run.stdout.slice(-TAIL)}\n${run.stderr.slice(-TAIL)}`,
    );
}

/** A PNG as WebP, by the browser's own encoder: nothing else here writes WebP. */
async function toWebp(
  page: Page,
  png: string,
  quality: number,
): Promise<Uint8Array> {
  const encoded = await page.evaluate(
    async ([data, quality]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", quality).split(",")[1] ?? "";
    },
    [readFileSync(png).toString("base64"), quality] as const,
  );
  return Buffer.from(encoded, "base64");
}

/** Converts the scenes' pictures into the module's folder; what each now is. */
async function convert(
  theme: RenderedTheme,
  scenes: readonly Scene[],
  out: string,
): Promise<Manifest> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const entries: [string, Manifest[string]][] = [];
    for (const name of scenes.flatMap((scene) => scene.pictures)) {
      const bytes = await toWebp(
        page,
        join(out, `${name}.png`),
        theme.quality?.(`${name}.webp`) ?? QUALITY,
      );
      const picture = describePicture(bytes);
      const expected = theme.expectedSize(`${name}.webp`);
      if (
        picture.width !== expected.width ||
        picture.height !== expected.height
      )
        throw new Error(
          `${name} is ${String(picture.width)} by ${String(picture.height)}, not the ${String(expected.width)} by ${String(expected.height)} its measures say`,
        );
      await writeFile(join(theme.artDir, `${name}.webp`), bytes);
      entries.push([`${name}.webp`, picture]);
      console.log(`${String(picture.bytes).padStart(8)}  ${name}.webp`);
    }
    return Object.fromEntries(entries);
  } finally {
    await browser.close();
  }
}

const listed = (file: string): Manifest =>
  existsSync(file) ? parseManifest(readFileSync(file, "utf8")) : {};

/** Renders the named scenes of a theme, or all of them, and lists what they made. */
export async function renderTheme(
  theme: RenderedTheme,
  named: readonly string[],
): Promise<void> {
  const scenes = chosenScenes(theme.scenes, named);
  const textures = await theme.fetchTextures();
  const out = mkdtempSync(join(tmpdir(), `${theme.name}-render-`));
  try {
    await theme.prepare?.(out);
    for (const scene of scenes) renderScene(theme, scene, out, textures);
    await mkdir(theme.artDir, { recursive: true });
    // Some scenes: the others' pictures stay listed, but none that no scene makes any more.
    // All of them: the list is what they made.
    const made = new Set(
      theme.scenes.flatMap((scene) =>
        scene.pictures.map((name) => `${name}.webp`),
      ),
    );
    const kept =
      named.length > 0
        ? Object.fromEntries(
            Object.entries(listed(theme.manifest)).filter(([name]) =>
              made.has(name),
            ),
          )
        : {};
    const manifest = { ...kept, ...(await convert(theme, scenes, out)) };
    const sorted = Object.fromEntries(
      Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
    );
    await writeFile(theme.manifest, `${JSON.stringify(sorted, null, 2)}\n`);
    const total = Object.values(sorted).reduce((sum, p) => sum + p.bytes, 0);
    console.log(
      `${String(total).padStart(8)}  bytes in all, listed in ${theme.manifest}`,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
