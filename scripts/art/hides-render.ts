// Renders the hides theme's pictures with Blender and lists them in
// tools/art/hides/rendered.json, which locks what the module ships.
//
//   node scripts/art/hides-render.ts            every scene
//   node scripts/art/hides-render.ts skull      only the named ones
//
// What it needs is said in render-theme.ts. The CC0 textures and the
// scanned skull are fetched once (tools/art/hides/textures.ts).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ART_DIR } from "../../tools/art/hides/files.ts";
import { FRAME } from "../../tools/art/hides/geometry.ts";
import { drawDaubs } from "../../tools/art/hides/paint.ts";
import {
  expectedSize,
  HIDES,
  MANIFEST,
  SCENE_DIR,
  SCENES,
} from "../../tools/art/hides/rendered.ts";
import { fetchHidesTextures } from "../../tools/art/hides/textures.ts";
import { renderTheme } from "./render-theme.ts";

/**
 * The war paint's daubs as pixels, one picture for each hide, as large as
 * a frame picture: the hide's scene keeps its painted hide only where
 * they are. A browser draws them, because their ragged edges are filters
 * only a browser has.
 */
async function drawPaint(out: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: FRAME });
    for (const number of HIDES) {
      await page.setContent(
        `<style>html, body { margin: 0; background: transparent } svg { display: block; width: 100vw; height: 100vh }</style>${drawDaubs(number - 1)}`,
      );
      const png = await page.screenshot({ omitBackground: true });
      await writeFile(join(out, `daubs-${String(number)}.png`), png);
    }
  } finally {
    await browser.close();
  }
}

await renderTheme(
  {
    name: "hides",
    sceneDir: SCENE_DIR,
    scenes: SCENES,
    artDir: ART_DIR,
    manifest: MANIFEST,
    expectedSize,
    fetchTextures: fetchHidesTextures,
    prepare: drawPaint,
  },
  process.argv.slice(2),
);
