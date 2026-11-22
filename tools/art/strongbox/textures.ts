// What the strongbox scenes read that was not made here, all of it CC0
// from Poly Haven: dark oiled planks (the box's boards, the knife's split
// grain, the stencil's wear), coarse rust (the iron's patches and
// pitting), herringbone wool (the rag stuffed into a deafened keyhole) and
// velour velvet (the box's padded lining). None of it is in the
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
  "modular-av-strongbox-textures",
);

type PolyHavenFile = TextureSource & { readonly file: string };

/** One map of a Poly Haven texture at 2K, under the name the scenes ask for. */
const polyHaven = (
  asset: string,
  map: string,
  sha256: string,
): PolyHavenFile => ({
  url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${asset}/${asset}_${map}_2k.jpg`,
  sha256,
  file: `${asset}_${map.replace(/_gl$/, "")}.jpg`,
});

export const TEXTURES: readonly PolyHavenFile[] = [
  // The box's boards; the split grain where the knife went in; the stencil's wear.
  polyHaven(
    "dark_wooden_planks",
    "diff",
    "527fa684c78d0a3b4fbfa87b9e2b48691215fcac8af0bf79fc6e01cefb4c4647",
  ),
  polyHaven(
    "dark_wooden_planks",
    "nor_gl",
    "047941a8e483d941abf6562270abd2c91d30d65e0a339fca0b1d3df125e92154",
  ),
  polyHaven(
    "dark_wooden_planks",
    "rough",
    "fb11f1eee7a982da0272d38695097a1f4c2047bd21eae71361fdcb6d7723c0ed",
  ),
  // The iron of everything: its patches, its pitting.
  polyHaven(
    "rust_coarse_01",
    "diff",
    "5b8801674fa53ff1b6f7853300f50aa7a1b31e69278554803bd957fe9fa7e392",
  ),
  polyHaven(
    "rust_coarse_01",
    "nor_gl",
    "495d3c87da059827ffaf49dae59f967cb3e0b187f4426ab0a47088c3fa83e50b",
  ),
  // The rag in a deafened keyhole.
  polyHaven(
    "poly_wool_herringbone",
    "diff",
    "ca21de8e2e7f43178f8290361bfb2271eb264af0d2887c7c93e76a113ff3cc64",
  ),
  polyHaven(
    "poly_wool_herringbone",
    "nor_gl",
    "bd68cd14cafdb033dccb80ff8aff2600317e66ef11eb37ef7f224e420075f1fd",
  ),
  polyHaven(
    "poly_wool_herringbone",
    "rough",
    "8678dfb7f474440c12a5f317fe01802dd1aabbb205a6c947bb044ade72294fa7",
  ),
  // The box's padded lining, seen where a camera is off or its player out.
  polyHaven(
    "velour_velvet",
    "diff",
    "7c81a1577f50a023825d8d5e26ec7f8596e47534d8ff601aa0b074980833e875",
  ),
  polyHaven(
    "velour_velvet",
    "nor_gl",
    "20207c7b1e4328f8b8b635435d33d5adf23c44f045d1f711b4105999d1883745",
  ),
];

/** Every file the scenes read, in the cache: downloads what is missing or changed. */
export const fetchStrongboxTextures = (): Promise<string> =>
  fetchTextures(TEXTURE_DIR, { sources: TEXTURES });
