// Renders the strongbox theme's pictures with Blender and lists them in
// tools/art/strongbox/rendered.json, which locks what the module ships.
//
//   node scripts/art/strongbox-render.ts           every scene
//   node scripts/art/strongbox-render.ts frames    only the named ones
//
// What it needs is said in render-theme.ts. The CC0 textures are fetched
// once (tools/art/strongbox/textures.ts).
import { ART_DIR } from "../../tools/art/strongbox/files.ts";
import {
  expectedSize,
  MANIFEST,
  SCENE_DIR,
  SCENES,
} from "../../tools/art/strongbox/rendered.ts";
import { fetchStrongboxTextures } from "../../tools/art/strongbox/textures.ts";
import { renderTheme } from "./render-theme.ts";

await renderTheme(
  {
    name: "strongbox",
    sceneDir: SCENE_DIR,
    scenes: SCENES,
    artDir: ART_DIR,
    manifest: MANIFEST,
    expectedSize,
    fetchTextures: fetchStrongboxTextures,
  },
  process.argv.slice(2),
);
