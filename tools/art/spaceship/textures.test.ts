import { describe, expect, it } from "vitest";
import { TEXTURE_DIR, TEXTURES } from "./textures.ts";

describe("what the spaceship scenes read", () => {
  it("is fetched over https, each file pinned by its hash", () => {
    for (const source of TEXTURES) {
      expect(new URL(source.url).protocol).toBe("https:");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("is photographed painted steel from Poly Haven, among the rest", () => {
    const files = TEXTURES.flatMap((source) =>
      "file" in source ? [source.file] : [],
    );

    expect(files).toEqual(
      expect.arrayContaining([
        "green_metal_rust_diff.jpg",
        "green_metal_rust_nor.jpg",
        "green_metal_rust_rough.jpg",
        "blue_metal_plate_diff.jpg",
        "blue_metal_plate_nor.jpg",
        "blue_metal_plate_rough.jpg",
      ]),
    );
  });

  it("is kept in a cache of its own, outside what is committed", () => {
    expect(TEXTURE_DIR).toMatch(
      /node_modules\/\.cache\/modular-av-spaceship-textures$/,
    );
  });
});
