// Renders the scrolls theme's pictures with Blender and lists them in
// tools/art/scrolls/rendered.json, which locks what the module ships.
//
//   node scripts/art/scrolls-render.ts            every scene
//   node scripts/art/scrolls-render.ts stones     only the named ones
//
// What it needs is said in render-theme.ts. The CC0 textures are fetched
// once (tools/art/scrolls/textures.ts).
import { ART_DIR } from "../../tools/art/scrolls/files.ts";
import {
  expectedSize,
  MANIFEST,
  SCENE_DIR,
  SCENES,
} from "../../tools/art/scrolls/rendered.ts";
import { fetchTextures } from "../../tools/art/scrolls/textures.ts";
import { renderTheme } from "./render-theme.ts";

await renderTheme(
  {
    name: "scrolls",
    sceneDir: SCENE_DIR,
    scenes: SCENES,
    artDir: ART_DIR,
    manifest: MANIFEST,
    expectedSize,
    fetchTextures: () => fetchTextures(),
  },
  process.argv.slice(2),
);
