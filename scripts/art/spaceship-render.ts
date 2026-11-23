// Renders the spaceship theme's pictures with Blender and lists them in
// tools/art/spaceship/rendered.json, which locks what the module ships.
//
//   node scripts/art/spaceship-render.ts           every scene
//   node scripts/art/spaceship-render.ts frames    only the named ones
//
// What it needs is said in render-theme.ts. The CC0 textures and models are
// fetched once (tools/art/spaceship/textures.ts).
import { ART_DIR } from "../../tools/art/spaceship/files.ts";
import {
  expectedSize,
  MANIFEST,
  qualityOf,
  SCENE_DIR,
  SCENES,
} from "../../tools/art/spaceship/rendered.ts";
import { fetchSpaceshipTextures } from "../../tools/art/spaceship/textures.ts";
import { renderTheme } from "./render-theme.ts";

await renderTheme(
  {
    name: "spaceship",
    sceneDir: SCENE_DIR,
    scenes: SCENES,
    artDir: ART_DIR,
    manifest: MANIFEST,
    expectedSize,
    quality: qualityOf,
    fetchTextures: fetchSpaceshipTextures,
  },
  process.argv.slice(2),
);
