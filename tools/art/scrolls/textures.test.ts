import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { fetchTextures, TEXTURES, type TextureSource } from "./textures.ts";

const sha = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");
const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "textures-"));

const WOOD = "a photograph of wood";
const ARCHIVE = zipSync({
  "Paper_Color.jpg": strToU8("the paper's colour"),
  "Paper_Normal.jpg": strToU8("the paper's relief"),
  "Paper.blend": strToU8("not wanted"),
});
const SOURCES: readonly TextureSource[] = [
  {
    url: "https://textures.example/wood_diff_2k.jpg",
    sha256: sha(WOOD),
    file: "wood_diff.jpg",
  },
  {
    url: "https://textures.example/get?file=Paper.zip",
    sha256: sha(ARCHIVE),
    unzip: {
      "paper_colour.jpg": {
        inside: "Paper_Color.jpg",
        sha256: sha("the paper's colour"),
      },
      "paper_relief.jpg": {
        inside: "Paper_Normal.jpg",
        sha256: sha("the paper's relief"),
      },
    },
  },
];

/** Serves the two sources, and counts what was asked for. */
const serving = (
  wood: string = WOOD,
  archive: Uint8Array<ArrayBuffer> = ARCHIVE,
): typeof fetch =>
  vi.fn((url: string | URL | Request) =>
    Promise.resolve(
      new Response(new Request(url).url.endsWith(".zip") ? archive : wood, {
        status: 200,
      }),
    ),
  );

describe("the textures the scenes are rendered with", () => {
  it("are pinned: an https address and a hash for each, and for each file taken out of an archive", () => {
    const hash = /^[0-9a-f]{64}$/;

    expect(TEXTURES.length).toBeGreaterThan(0);
    for (const source of TEXTURES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.sha256).toMatch(hash);
      if ("unzip" in source)
        for (const part of Object.values(source.unzip))
          expect(part.sha256).toMatch(hash);
    }
  });

  it("have the names the scenes ask for: three of each wood, three of the paper", () => {
    const names = TEXTURES.flatMap((source) =>
      "unzip" in source ? Object.keys(source.unzip) : [source.file],
    );

    expect(names.sort()).toEqual(
      [
        ...["dark_wood", "smoked_walnut_veneer"].flatMap((wood) =>
          ["diff", "nor", "rough"].map((kind) => `${wood}_${kind}.jpg`),
        ),
        "Paper006_Color.jpg",
        "Paper006_NormalGL.jpg",
        "Paper006_Roughness.jpg",
      ].sort(),
    );
  });
});

describe("fetchTextures", () => {
  it("downloads each source once, and takes the named files out of an archive", async () => {
    const dir = join(await scratch(), "textures");
    const fetcher = serving();

    await fetchTextures(dir, { sources: SOURCES, fetcher });

    expect((await readdir(dir)).sort()).toEqual([
      "paper_colour.jpg",
      "paper_relief.jpg",
      "wood_diff.jpg",
    ]);
    expect(await readFile(join(dir, "wood_diff.jpg"), "utf8")).toBe(WOOD);
    expect(await readFile(join(dir, "paper_relief.jpg"), "utf8")).toBe(
      "the paper's relief",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("downloads nothing that is already there and whole", async () => {
    const dir = await scratch();
    await fetchTextures(dir, { sources: SOURCES, fetcher: serving() });
    const fetcher = serving();

    await fetchTextures(dir, { sources: SOURCES, fetcher });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches a source again when one of its files was changed", async () => {
    const dir = await scratch();
    await fetchTextures(dir, { sources: SOURCES, fetcher: serving() });
    await writeFile(join(dir, "paper_colour.jpg"), "scribbled over");
    const fetcher = serving();

    await fetchTextures(dir, { sources: SOURCES, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await readFile(join(dir, "paper_colour.jpg"), "utf8")).toBe(
      "the paper's colour",
    );
  });

  it("refuses a download that isn't the pinned file, and writes nothing of it", async () => {
    const dir = await scratch();

    await expect(
      fetchTextures(dir, {
        sources: SOURCES,
        fetcher: serving("another picture"),
      }),
    ).rejects.toThrow(/wood_diff\.jpg: sha256 .* doesn't match/);
    expect(await readdir(dir)).not.toContain("wood_diff.jpg");
  });

  it("refuses an archive whose file isn't the pinned one, or isn't there", async () => {
    const changed: readonly TextureSource[] = [
      {
        url: "https://textures.example/get?file=Paper.zip",
        sha256: sha(ARCHIVE),
        unzip: {
          "paper_colour.jpg": { inside: "Paper_Color.jpg", sha256: sha("x") },
        },
      },
    ];
    const missing: readonly TextureSource[] = [
      {
        url: "https://textures.example/get?file=Paper.zip",
        sha256: sha(ARCHIVE),
        unzip: {
          "paper_gloss.jpg": { inside: "Paper_Gloss.jpg", sha256: sha("x") },
        },
      },
    ];

    await expect(
      fetchTextures(await scratch(), { sources: changed, fetcher: serving() }),
    ).rejects.toThrow(/paper_colour\.jpg: sha256 .* doesn't match/);
    await expect(
      fetchTextures(await scratch(), { sources: missing, fetcher: serving() }),
    ).rejects.toThrow(/paper_gloss\.jpg: no Paper_Gloss\.jpg in the archive/);
  });
});
