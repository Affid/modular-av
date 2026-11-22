import { describe, expect, it } from "vitest";
import { TEXTURE_DIR, TEXTURES } from "./textures.ts";

describe("what the strongbox scenes read", () => {
  it("is photographed boards, rusted iron, wool and velvet from Poly Haven", () => {
    expect(TEXTURES.map((source) => source.file).sort()).toEqual(
      [
        "dark_wooden_planks_diff.jpg",
        "dark_wooden_planks_nor.jpg",
        "dark_wooden_planks_rough.jpg",
        "rust_coarse_01_diff.jpg",
        "rust_coarse_01_nor.jpg",
        "poly_wool_herringbone_diff.jpg",
        "poly_wool_herringbone_nor.jpg",
        "poly_wool_herringbone_rough.jpg",
        "velour_velvet_diff.jpg",
        "velour_velvet_nor.jpg",
      ].sort(),
    );
  });

  it("is fetched over https from Poly Haven, each file pinned by its hash", () => {
    for (const source of TEXTURES) {
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("dl.polyhaven.org");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(TEXTURES.map((source) => source.sha256)).size).toBe(
      TEXTURES.length,
    );
  });

  it("is kept in a cache of its own, outside what is committed", () => {
    expect(TEXTURE_DIR).toMatch(
      /node_modules\/\.cache\/modular-av-strongbox-textures$/,
    );
  });
});
