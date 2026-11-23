// What the spaceship scenes read that was not made here, CC0 from Poly
// Haven: rusted green painted metal (the grain, chips and scratches of
// every painted steel face: the bulkhead, the monitors' cases, the plates),
// a scuffed blue painted plate (the cases' scuffs), and the models of the
// things hung on the wall (render/things.py). Also two DejaVu fonts (the
// Bitstream Vera licence: free to use; only their letters end up in a
// picture) for the extinguisher's label. None of it is in the repository:
// each file is pinned by its address and hash and fetched into a cache
// before rendering, as the scrolls theme's textures are
// (../scrolls/textures.ts).
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";
import { fetchTextures, type TextureSource } from "../scrolls/textures.ts";

export const TEXTURE_DIR = join(
  ROOT,
  "node_modules",
  ".cache",
  "modular-av-spaceship-textures",
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

const MODELS = "https://dl.polyhaven.org/file/ph-assets/Models";

/**
 * One file of a Poly Haven model, laid out in the cache as its glTF names
 * it: `<asset>/<asset>_2k.gltf`, `<asset>/<asset>.bin` and
 * `<asset>/textures/<map>`.
 */
const modelFile = (
  asset: string,
  file: string,
  path: string,
  sha256: string,
): PolyHavenFile => ({
  url: `${MODELS}/${path}`,
  sha256,
  file: `${asset}/${file}`,
});
const gltf = (asset: string, sha256: string): PolyHavenFile =>
  modelFile(
    asset,
    `${asset}_2k.gltf`,
    `gltf/2k/${asset}/${asset}_2k.gltf`,
    sha256,
  );
/** Poly Haven serves a model's one buffer from its largest size's folder. */
const bin = (asset: string, folder: string, sha256: string): PolyHavenFile =>
  modelFile(
    asset,
    `${asset}.bin`,
    `gltf/${folder}/${asset}/${asset}.bin`,
    sha256,
  );
const map = (asset: string, name: string, sha256: string): PolyHavenFile =>
  modelFile(
    asset,
    `textures/${asset}_${name}_2k.jpg`,
    `jpg/2k/${asset}/${asset}_${name}_2k.jpg`,
    sha256,
  );

/** The two fonts the label is typed in, out of DejaVu's 2.37 release. */
const DEJAVU: TextureSource = {
  url: "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip",
  sha256: "7576310b219e04159d35ff61dd4a4ec4cdba4f35c00e002a136f00e96a908b0a",
  unzip: {
    "DejaVuSansCondensed-Bold.ttf": {
      inside: "dejavu-fonts-ttf-2.37/ttf/DejaVuSansCondensed-Bold.ttf",
      sha256:
        "38098d0b8edd8430a0f53fb2831b5d36037563a998a620d3c87a4d7591766d20",
    },
    "DejaVuSansMono.ttf": {
      inside: "dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf",
      sha256:
        "b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582",
    },
  },
};

export const TEXTURES: readonly TextureSource[] = [
  // Every painted steel face: the paint's grain, its chips and scratches, its rust.
  polyHaven(
    "green_metal_rust",
    "diff",
    "727515554ffb6410be82d3625a2837fe46612cb186ec391f77c50bd52c4d7ab2",
  ),
  polyHaven(
    "green_metal_rust",
    "nor_gl",
    "45ec5d256c91ccf4a87dd4c4a90f6c58b460f3862287f014bfde432055ece239",
  ),
  polyHaven(
    "green_metal_rust",
    "rough",
    "0a691b35df773ab86dbbc86b787f8efaa81497780820abec0832b1e7aac309a6",
  ),
  // The monitors' cases: scuffed painted plate.
  polyHaven(
    "blue_metal_plate",
    "diff",
    "82855f6297ad07ea7ea4d1c501e6b56ed4c9c758653ca126bda9fd0ebba63c59",
  ),
  polyHaven(
    "blue_metal_plate",
    "nor_gl",
    "4cd3069a918cf891295b369b26f47c0a0631c634d0fd1006b6b7412a8f2b3550",
  ),
  polyHaven(
    "blue_metal_plate",
    "rough",
    "dd1726d8217fe4f6c3947cb20700d51774a0773e9abaeb4120769c8f6fce1d69",
  ),
  // The things hung on the wall (render/things.py). The extinguisher: its
  // stand, tag and printed label are taken off in the scene, but its glTF
  // names every map, so all are fetched.
  gltf(
    "korean_fire_extinguisher_01",
    "d12176b2979cd8028f84d4068c8049b5e6a47e4d9379f3cb2908fa615c5c6900",
  ),
  bin(
    "korean_fire_extinguisher_01",
    "8k",
    "a460dd65b63477bb641196d77393258af0c8a6e2a64728156cb45d92658c86bd",
  ),
  map(
    "korean_fire_extinguisher_01",
    "body_arm",
    "2f5387154f4985ae8103825f05acd1a9c43e3307642f3b74b26db8932346e34c",
  ),
  map(
    "korean_fire_extinguisher_01",
    "body_diff",
    "7e06bcb002addaa30c8fea0e4432f3855d77a5348d7cc41791bd10b44cd511f4",
  ),
  map(
    "korean_fire_extinguisher_01",
    "body_nor_gl",
    "6fdb28b9bfd83f530f1abaa0ac0e6401a98466d74f20bca0fabf47ba2d2b75f4",
  ),
  map(
    "korean_fire_extinguisher_01",
    "glass_arm",
    "d618f13b5c84957ae3e3b79f189465f52f9d409e17a0e110ded95adf39dcda62",
  ),
  map(
    "korean_fire_extinguisher_01",
    "glass_diff",
    "a9b4a14d19b38947eee3a868e2453053b09804b2addc82f5603b40ec11917ca7",
  ),
  map(
    "korean_fire_extinguisher_01",
    "glass_nor_gl",
    "cfd8ebf3c668f0db5f37baa4b3abe8678f088b18c5eb493e8ccef2e4c78de45e",
  ),
  map(
    "korean_fire_extinguisher_01",
    "paper_arm",
    "b4ea1553ae5a841cc837f92cced525868f0f67d02d72914adba553d3154ce6c5",
  ),
  map(
    "korean_fire_extinguisher_01",
    "paper_diff",
    "7b257c41705c1188017712889e40d5ec4f1a60a065c7c16f54dea4c0b56d9936",
  ),
  map(
    "korean_fire_extinguisher_01",
    "paper_nor_gl",
    "2446b9fa2516a5b86ec31227630fb46d297a79c365f00d5f93d010d254bb3794",
  ),
  // The clipboard the manifest hangs on.
  gltf(
    "clipboard",
    "21299eb9fbfc3ec2f7793c3797b565232919fe4bd918d588556d63bf73043bb2",
  ),
  bin(
    "clipboard",
    "8k",
    "c108d9cc94bc513ff9f91077e02cbe9f49a96d4907abd06803e379508fd98bb2",
  ),
  map(
    "clipboard",
    "arm",
    "76b254d4ba39895a0f8ccd1c988f759d463e5013c180b181dfc823dba0e0cec2",
  ),
  map(
    "clipboard",
    "diff",
    "a2f22cf95ea8358bb47fbd3a9882b22f167e83c57775f8af8140e17d65dabc86",
  ),
  map(
    "clipboard",
    "nor_gl",
    "52ab3dcc119a9f97a618a29102c319da4b5c626425687ac5d8c42d9878f9b757",
  ),
  // The wrench.
  gltf(
    "combination_wrench",
    "da902865950261d057e2aab1934c43356f85cae622d15c4655cfc18deff69b29",
  ),
  bin(
    "combination_wrench",
    "4k",
    "799674a7f462991b17badd71e32d51fe92b3f8d88156ad38663c1da8d441e8c3",
  ),
  map(
    "combination_wrench",
    "arm",
    "61e4c67d9f6d497130c587a5fda9438b8bbcaaf99ed3afe37638b84d7b02c4ba",
  ),
  map(
    "combination_wrench",
    "diff",
    "bfbf6af7d428aee25fc7a8a30a74f04053ff533afde8f028facb35be10f409ad",
  ),
  map(
    "combination_wrench",
    "nor_gl",
    "c9b17a9276154e958d6f8b13b529ef995e779c01ae3f5f71d47b19ea4fdd2131",
  ),
  // The extinguisher label's letters.
  DEJAVU,
];

/** Every file the scenes read, in the cache: downloads what is missing or changed. */
export const fetchSpaceshipTextures = (): Promise<string> =>
  fetchTextures(TEXTURE_DIR, { sources: TEXTURES });
