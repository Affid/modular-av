// What the mirrors scenes read that was not made here, all of it CC0: a
// photographed steel sheet and a lacquered wood from Poly Haven (the
// silver's tarnish, the glass's flow and its scratches), creased paper
// from ambientCG (the contract), and MakeHuman's base mesh with its rig
// (every hand). None of it is in the repository: each file is pinned by
// its address and hash and fetched into a cache before rendering, as the
// scrolls theme's textures are (../scrolls/textures.ts). MakeHuman's files
// come from one commit of its repository, so the address never moves.
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { fetchTextures, type TextureSource } from "../scrolls/textures.ts";

export const TEXTURE_DIR = join(
  ROOT,
  "node_modules",
  ".cache",
  "modular-av-mirrors-textures",
);

/** One map of a Poly Haven texture at 2K, under the name the scenes ask for. */
const polyHaven = (
  asset: string,
  map: string,
  sha256: string,
): TextureSource => ({
  url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${asset}/${asset}_${map}_2k.jpg`,
  sha256,
  file: `${asset}_${map}.jpg`,
});

/** The MakeHuman repository's commit the base mesh and the rig are taken from. */
const MAKEHUMAN_COMMIT = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482";

/** One of MakeHuman's data files (CC0, as each file and the repository's LICENSE.md say). */
const makeHuman = (path: string, sha256: string): TextureSource => ({
  url: `https://raw.githubusercontent.com/makehumancommunity/makehuman/${MAKEHUMAN_COMMIT}/makehuman/data/${path}`,
  sha256,
  file: path.split("/").pop() ?? path,
});

/** The files the hands are cut from (handmesh.ts). */
export const MAKEHUMAN = [
  "base.obj",
  "default.mhskel",
  "default_weights.mhw",
] as const;

export const TEXTURES: readonly TextureSource[] = [
  // The silver's patches and tarnish; the glass's faint flow and smudges.
  polyHaven(
    "rusty_metal_sheet",
    "diff",
    "1bba003f3da47728b7108fb54a8f51fec17b3d62d89eefb2bf711688e2e929b6",
  ),
  polyHaven(
    "rusty_metal_sheet",
    "rough",
    "f1fc8d5cfb6c6b55712c07b326934d94eb7aeb4f146b67c1823348af69cfddd4",
  ),
  // The glass's fine scratches: a lacquer's wear.
  polyHaven(
    "lacquered_cherry_wood",
    "rough",
    "e1d7ec1e5d030e764b8bcad07048a7e197fae4498e57c29facc83d726e44a290",
  ),
  // The contract's creased sheet.
  {
    url: "https://ambientcg.com/get?file=Paper003_2K-JPG.zip",
    sha256: "7939efd9c04e3da41341386730ad657034ed19dafc2211bad80e6f5182e89a2c",
    unzip: {
      "Paper003_Color.jpg": {
        inside: "Paper003_2K-JPG_Color.jpg",
        sha256:
          "b4ca68a796c628944a6ab655459501b1e4d3644b9ded6e5d66e42af752421a80",
      },
      "Paper003_NormalGL.jpg": {
        inside: "Paper003_2K-JPG_NormalGL.jpg",
        sha256:
          "bfee7dec0fc401ca05d32cd3ea737538b4694cb2dd52b0e227c27a860341eb12",
      },
    },
  },
  // Every hand: the body's mesh, its skeleton and the skeleton's weights.
  makeHuman(
    "3dobjs/base.obj",
    "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c",
  ),
  makeHuman(
    "rigs/default.mhskel",
    "99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24",
  ),
  makeHuman(
    "rigs/default_weights.mhw",
    "0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625",
  ),
];

/** Every file the scenes read, in the cache: downloads what is missing or changed. */
export const fetchMirrorsTextures = (): Promise<string> =>
  fetchTextures(TEXTURE_DIR, { sources: TEXTURES });
