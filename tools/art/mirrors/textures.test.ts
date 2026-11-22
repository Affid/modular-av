import { describe, expect, it } from "vitest";
import { MAKEHUMAN, TEXTURE_DIR, TEXTURES } from "./textures.ts";

const filesOf = (source: (typeof TEXTURES)[number]): readonly string[] =>
  "file" in source ? [source.file] : Object.keys(source.unzip);

describe("what the mirrors scenes read", () => {
  it("is photographed steel and lacquer from Poly Haven, paper from ambientCG, and MakeHuman's hand", () => {
    expect(TEXTURES.flatMap(filesOf).sort()).toEqual(
      [
        "rusty_metal_sheet_diff.jpg",
        "rusty_metal_sheet_rough.jpg",
        "lacquered_cherry_wood_rough.jpg",
        "Paper003_Color.jpg",
        "Paper003_NormalGL.jpg",
        ...MAKEHUMAN,
      ].sort(),
    );
    expect(MAKEHUMAN).toEqual([
      "base.obj",
      "default.mhskel",
      "default_weights.mhw",
    ]);
  });

  it("is fetched over https, each file pinned by its hash", () => {
    const hosts = new Set<string>();
    for (const source of TEXTURES) {
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      hosts.add(url.hostname);
    }
    expect([...hosts].sort()).toEqual([
      "ambientcg.com",
      "dl.polyhaven.org",
      "raw.githubusercontent.com",
    ]);
    expect(new Set(TEXTURES.map((source) => source.sha256)).size).toBe(
      TEXTURES.length,
    );
  });

  it("takes MakeHuman's files from one commit of its repository, never a branch that moves", () => {
    const makehuman = TEXTURES.filter((source) =>
      source.url.includes("makehumancommunity"),
    );

    expect(makehuman).toHaveLength(3);
    for (const source of makehuman)
      expect(source.url).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/makehumancommunity\/makehuman\/[0-9a-f]{40}\/makehuman\/data\//,
      );
  });

  it("is kept in a cache of its own, outside what is committed", () => {
    expect(TEXTURE_DIR).toMatch(
      /node_modules\/\.cache\/modular-av-mirrors-textures$/,
    );
  });
});
