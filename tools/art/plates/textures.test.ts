import { describe, expect, it } from "vitest";
import { TEXTURE_DIR, TEXTURES } from "./textures.ts";

const fileOf = (source: (typeof TEXTURES)[number]): string =>
  "file" in source ? source.file : "";

describe("what the plates scenes read", () => {
  it("is photographed steel, linen and leather from Poly Haven: colour, relief and roughness of each", () => {
    expect(TEXTURES.map(fileOf).sort()).toEqual(
      ["rusty_metal_sheet", "rough_linen", "fabric_leather_01"]
        .flatMap((asset) =>
          ["diff", "nor", "rough"].map((map) => `${asset}_${map}.jpg`),
        )
        .sort(),
    );
  });

  it("is fetched over https from that one place, each file pinned by its hash", () => {
    for (const source of TEXTURES) {
      expect(new URL(source.url).hostname).toBe("dl.polyhaven.org");
      expect(new URL(source.url).protocol).toBe("https:");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(TEXTURES.map((source) => source.sha256)).size).toBe(
      TEXTURES.length,
    );
  });

  it("is kept in a cache of its own, outside what is committed", () => {
    expect(TEXTURE_DIR).toMatch(
      /node_modules\/\.cache\/modular-av-plates-textures$/,
    );
  });
});
