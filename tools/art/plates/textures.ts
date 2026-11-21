// What the plates scenes read that was not made here: a photographed steel
// sheet, linen and leather from Poly Haven, all CC0. None of it is in the
// repository: each file is pinned by its address and hash and fetched into
// a cache before rendering, as the scrolls theme's textures are
// (../scrolls/textures.ts).
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { fetchTextures, type TextureSource } from "../scrolls/textures.ts";

export const TEXTURE_DIR = join(
  ROOT,
  "node_modules",
  ".cache",
  "modular-av-plates-textures",
);

/** One map of a Poly Haven texture at 2K, under the name the scenes ask for. */
const polyHaven = (
  asset: string,
  map: string,
  sha256: string,
): TextureSource => ({
  url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${asset}/${asset}_${map}_2k.jpg`,
  sha256,
  file: `${asset}_${map.replace(/_gl$/, "")}.jpg`,
});

export const TEXTURES: readonly TextureSource[] = [
  // The steel of everything: its patches, its pitting and its rust.
  polyHaven(
    "rusty_metal_sheet",
    "diff",
    "1bba003f3da47728b7108fb54a8f51fec17b3d62d89eefb2bf711688e2e929b6",
  ),
  polyHaven(
    "rusty_metal_sheet",
    "nor_gl",
    "dbcdb93c3cd9d332ed29e144540ef81798f637a8c5ccd057e52cad28b60f3750",
  ),
  polyHaven(
    "rusty_metal_sheet",
    "rough",
    "f1fc8d5cfb6c6b55712c07b326934d94eb7aeb4f146b67c1823348af69cfddd4",
  ),
  // The cord round a plate, and the cloth under the mail.
  polyHaven(
    "rough_linen",
    "diff",
    "e71016e08dfebea1dd4e8a2a675e3b617a889a782af782f1abb795906f4db1b4",
  ),
  polyHaven(
    "rough_linen",
    "nor_gl",
    "c5733ad50cfe0f90c546f3d4076590c1c78a4fd1a83c967cc9c92dc8175b99e6",
  ),
  polyHaven(
    "rough_linen",
    "rough",
    "48400d48fa203882bf5d984d5beb2f95edb1550309924601c018f2c4f3f80731",
  ),
  // Straps, thongs and grips.
  polyHaven(
    "fabric_leather_01",
    "diff",
    "ca8123e6c031365fd782323bee05ce9da8bf05cc2ed57a83a66f0874923648d8",
  ),
  polyHaven(
    "fabric_leather_01",
    "nor_gl",
    "e4b6b2971ef0dfe999cc288db052011e76f7f5c18a17f7a9b7f8e45d77791959",
  ),
  polyHaven(
    "fabric_leather_01",
    "rough",
    "f3c5d08786ca78b984e4563d92e551b34a1d7f6845b1376da44694039aa62e3b",
  ),
];

/** Every file the scenes read, in the cache: downloads what is missing or changed. */
export const fetchPlatesTextures = (): Promise<string> =>
  fetchTextures(TEXTURE_DIR, { sources: TEXTURES });
