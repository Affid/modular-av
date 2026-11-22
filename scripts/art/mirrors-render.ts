// Renders the mirrors theme's pictures with Blender and lists them in
// tools/art/mirrors/rendered.json, which locks what the module ships.
//
//   node scripts/art/mirrors-render.ts            every scene
//   node scripts/art/mirrors-render.ts hands      only the named ones
//
// What it needs is said in render-theme.ts. The CC0 textures and
// MakeHuman's base mesh and rig are fetched once
// (tools/art/mirrors/textures.ts); the hands' mesh is cut out of them
// before every render (tools/art/mirrors/handmesh.ts).
import { ART_DIR } from "../../tools/art/mirrors/files.ts";
import { writeHandMesh } from "../../tools/art/mirrors/handmesh.ts";
import {
  expectedSize,
  MANIFEST,
  SCENE_DIR,
  SCENES,
} from "../../tools/art/mirrors/rendered.ts";
import {
  fetchMirrorsTextures,
  TEXTURE_DIR,
} from "../../tools/art/mirrors/textures.ts";
import { renderTheme } from "./render-theme.ts";

await renderTheme(
  {
    name: "mirrors",
    sceneDir: SCENE_DIR,
    scenes: SCENES,
    artDir: ART_DIR,
    manifest: MANIFEST,
    expectedSize,
    fetchTextures: fetchMirrorsTextures,
    prepare: (out) => writeHandMesh(TEXTURE_DIR, out),
  },
  process.argv.slice(2),
);
