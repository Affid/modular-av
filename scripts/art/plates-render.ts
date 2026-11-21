// Renders the plates theme's pictures with Blender and lists them in
// tools/art/plates/rendered.json, which locks what the module ships.
//
//   node scripts/art/plates-render.ts            every scene
//   node scripts/art/plates-render.ts buckler    only the named ones
//
// What it needs is said in render-theme.ts. The CC0 textures are fetched
// once (tools/art/plates/textures.ts).
import { ART_DIR } from "../../tools/art/plates/files.ts";
import {
  expectedSize,
  MANIFEST,
  SCENE_DIR,
  SCENES,
} from "../../tools/art/plates/rendered.ts";
import { fetchPlatesTextures } from "../../tools/art/plates/textures.ts";
import { renderTheme } from "./render-theme.ts";

await renderTheme(
  {
    name: "plates",
    sceneDir: SCENE_DIR,
    scenes: SCENES,
    artDir: ART_DIR,
    manifest: MANIFEST,
    expectedSize,
    fetchTextures: fetchPlatesTextures,
  },
  process.argv.slice(2),
);
