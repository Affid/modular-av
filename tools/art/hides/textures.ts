// What the hides scenes read that was not made here: photographed leather,
// wood and a timber wall from Poly Haven, and one scanned skull from the
// Smithsonian's open-access collection. All of it is CC0. None of it is in
// the repository: each file is pinned by its address and hash and fetched
// into a cache before rendering, as the scrolls theme's textures are
// (../scrolls/textures.ts).
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { fetchTextures, type TextureSource } from "../scrolls/textures.ts";

export const TEXTURE_DIR = join(
  ROOT,
  "node_modules",
  ".cache",
  "modular-av-hides-textures",
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

/**
 * The skull on the wall: the Smithsonian's scan of its cast of a
 * white-tailed deer's skull (National Museum of Natural History,
 * Education and Outreach, record edanmdm:nmnheducation_15006160), which
 * its open-access catalogue marks CC0.
 */
export const SCAN = "deer-skull.glb";

export const TEXTURES: readonly TextureSource[] = [
  // The hides.
  polyHaven(
    "fabric_leather_02",
    "diff",
    "d2cd2e14face20b152dffd1d59a48d91bbef7b516242bc39c401c09d018e7eb8",
  ),
  polyHaven(
    "fabric_leather_02",
    "nor_gl",
    "563b03aa64d8eabc9dac426c7f440550f7239480c68065c180a8bb16f31f746e",
  ),
  polyHaven(
    "fabric_leather_02",
    "rough",
    "36af9f3299a221608de05e4a7e2eac59c70f7a725e7de690361d2e1478d1e16f",
  ),
  // The thongs.
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
  // The poles and the pegs.
  polyHaven(
    "rough_wood",
    "diff",
    "0bd2b3195db9b54d55aa0f842801220ec5e1d389f5fc1e670b378bdaca3f8e7b",
  ),
  polyHaven(
    "rough_wood",
    "nor_gl",
    "b75cb1e989407e442c3255f3e05ea8c40162c0e5dc2efc9ef2515fce61319194",
  ),
  polyHaven(
    "rough_wood",
    "rough",
    "38343cb062e7fadcda513ded0b17271c9d7f1da56765d03508dc84c8ff1bd475",
  ),
  // The wall of the hall.
  polyHaven(
    "wood_trunk_wall",
    "diff",
    "eb1e6e60137f84bb50b6eb1158b8a8aa66ff22a6c89a410d40755b5be04d6a10",
  ),
  polyHaven(
    "wood_trunk_wall",
    "nor_gl",
    "3246486f50bf26664b153a28c80aa5060d82430640ef9f428caeb498c3dcb034",
  ),
  polyHaven(
    "wood_trunk_wall",
    "rough",
    "5cc0d9519b1a2ce7c1c4f8678f8b4187203a9a6532431bf19500f4d2bffae335",
  ),
  polyHaven(
    "wood_trunk_wall",
    "disp",
    "0cdb9a25ae390d3fdc9d508dd4ce4e8d16ce45825daaf9bd49e3ed567a1e30c4",
  ),
  {
    url: "https://3d-api.si.edu/content/document/3d_package:fcc69841-d8be-4103-be0f-143e374c9ce6/PALDEERSKULL-150k-4096-high.glb",
    sha256: "bede1cd906bfe744771595eb4893f1a1d0961db54d355f84775f416251f0f41d",
    file: SCAN,
  },
];

/** Every file the scenes read, in the cache: downloads what is missing or changed. */
export const fetchHidesTextures = (): Promise<string> =>
  fetchTextures(TEXTURE_DIR, { sources: TEXTURES });
