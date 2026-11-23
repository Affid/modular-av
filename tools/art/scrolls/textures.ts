// The photographed textures the Blender scenes read: wood from Poly Haven
// and paper from ambientCG, both CC0. They are not in the repository
// (14 MB that only a redraw needs): each is pinned by its address and
// hash, as a module's downloads are (tools/assets/downloads.ts), and
// fetched into a cache before rendering.
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { isSafePath } from "../../assets/assets.ts";
import { fetchChecked, writeWhole } from "../../assets/downloads.ts";
import { ROOT } from "../../workspace.ts";

interface Pinned {
  readonly url: string;
  /** Of what the address serves. */
  readonly sha256: string;
}

/** A file taken out of a downloaded archive. */
interface Unzipped {
  readonly inside: string;
  readonly sha256: string;
}

/** One download: a texture's file, or a zip archive with several, by the names the scenes ask for. */
export type TextureSource = Pinned &
  (
    | { readonly file: string }
    | { readonly unzip: Readonly<Record<string, Unzipped>> }
  );

export const TEXTURE_DIR = join(
  ROOT,
  "node_modules",
  ".cache",
  "modular-av-scrolls-textures",
);

const polyHaven = (
  asset: string,
  map: string,
  file: string,
  sha256: string,
): TextureSource => ({
  url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${asset}/${asset}_${map}_2k.jpg`,
  sha256,
  file,
});

export const TEXTURES: readonly TextureSource[] = [
  polyHaven(
    "dark_wood",
    "diff",
    "dark_wood_diff.jpg",
    "ff811f97ab46f1148f2753451fd9d64abf0ab9101e85922ed9f45fc3595a3cf2",
  ),
  polyHaven(
    "dark_wood",
    "nor_gl",
    "dark_wood_nor.jpg",
    "624c7262c726cbc7da8ad02941dc6c95dec104fdc20e2804560ea112814b1d5d",
  ),
  polyHaven(
    "dark_wood",
    "rough",
    "dark_wood_rough.jpg",
    "09eb42a24aeadcd5dd04d19f89d8df4116fd9cdbd405d0dab17e263b54ece133",
  ),
  polyHaven(
    "smoked_walnut_veneer",
    "diff",
    "smoked_walnut_veneer_diff.jpg",
    "9b2fa1de2705058cc82d012d74ecb483597a2e90b0287a9f0254d8e2a931c036",
  ),
  polyHaven(
    "smoked_walnut_veneer",
    "nor_gl",
    "smoked_walnut_veneer_nor.jpg",
    "1ef44c50ecc6fabbc8c6252cc40d0ee4ace73a947623e98682a7ca4a239f75fa",
  ),
  polyHaven(
    "smoked_walnut_veneer",
    "rough",
    "smoked_walnut_veneer_rough.jpg",
    "e8245f6ec6dbe3064b1377c8eb443c60e964a4b62937e98019127a30303daebc",
  ),
  {
    url: "https://ambientcg.com/get?file=Paper006_1K-JPG.zip",
    sha256: "cd21850eb598b374f16c4ff2eaf2e22d8b56e0fe0b4b94d83db807a928bfce57",
    unzip: {
      "Paper006_Color.jpg": {
        inside: "Paper006_1K-JPG_Color.jpg",
        sha256:
          "7e8c8940b7d6bd4896c29f5cdbccd08eb6014099860ac1d863ec09b289bac51e",
      },
      "Paper006_NormalGL.jpg": {
        inside: "Paper006_1K-JPG_NormalGL.jpg",
        sha256:
          "acc0633ad85f618f0627699de0775d8e5d1d6859aacf579246b1369157eda096",
      },
      "Paper006_Roughness.jpg": {
        inside: "Paper006_1K-JPG_Roughness.jpg",
        sha256:
          "2450e75b684ce342c334453e781f8a3909e2ac9f34a21de0c74d6ec6c2879b1a",
      },
    },
  },
];

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Each file a source gives, with its hash. */
const filesOf = (
  source: TextureSource,
): readonly (readonly [string, string])[] =>
  "unzip" in source
    ? Object.entries(source.unzip).map(
        ([name, part]) => [name, part.sha256] as const,
      )
    : [[source.file, source.sha256]];

/** A file's name, checked to stay inside the cache (it may name a subfolder, never `..`). */
function inCache(name: string): string {
  if (!isSafePath(name))
    throw new Error(`${name} is not a path inside the cache`);
  return name;
}

async function isWhole(file: string, hash: string): Promise<boolean> {
  try {
    return sha256(await readFile(file)) === hash;
  } catch {
    // Not fetched yet.
    return false;
  }
}

/** A source's files out of what was downloaded, each checked. */
function unpack(
  source: TextureSource,
  bytes: Uint8Array,
): readonly (readonly [string, Uint8Array])[] {
  if (!("unzip" in source)) return [[source.file, bytes]];
  const wanted = new Set(Object.values(source.unzip).map((p) => p.inside));
  const archive = unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
  return Object.entries(source.unzip).map(([name, part]) => {
    const data = archive[part.inside];
    if (!data) throw new Error(`${name}: no ${part.inside} in the archive`);
    const got = sha256(data);
    if (got !== part.sha256)
      throw new Error(
        `${name}: sha256 ${got} doesn't match the pinned ${part.sha256}`,
      );
    return [name, data] as const;
  });
}

async function fetchSource(
  dir: string,
  source: TextureSource,
  fetcher: typeof fetch,
): Promise<void> {
  const files = filesOf(source).map(
    ([name, hash]) => [inCache(name), hash] as const,
  );
  const whole = await Promise.all(
    files.map(([name, hash]) => isWhole(join(dir, name), hash)),
  );
  if (whole.every(Boolean)) return;
  const label = files.map(([name]) => name).join(", ");
  const unpacked = unpack(source, await fetchChecked(label, source, fetcher));
  await Promise.all(
    unpacked.map(async ([name, data]) => {
      // A model names its textures in a folder beside it (textures/<file>).
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeWhole(join(dir, name), data);
    }),
  );
}

/** Every texture in `dir`, downloading what is missing or changed. */
export async function fetchTextures(
  dir: string = TEXTURE_DIR,
  options: {
    readonly sources?: readonly TextureSource[];
    readonly fetcher?: typeof fetch;
  } = {},
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const fetcher = options.fetcher ?? fetch;
  await Promise.all(
    (options.sources ?? TEXTURES).map((source) =>
      fetchSource(dir, source, fetcher),
    ),
  );
  return dir;
}
