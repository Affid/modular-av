import { describe, expect, it } from "vitest";
import { SCAN, TEXTURE_DIR, TEXTURES } from "./textures.ts";

const fileOf = (source: (typeof TEXTURES)[number]): string =>
  "file" in source ? source.file : "";

describe("what the hides scenes read", () => {
  it("is photographed leather, wood, rusted iron and a timber wall from Poly Haven, and one scanned skull from the Smithsonian", () => {
    expect(TEXTURES.map(fileOf).sort()).toEqual(
      [
        ...[
          "fabric_leather_02",
          "fabric_leather_01",
          "rough_wood",
          "rusty_metal_04",
        ].flatMap((asset) =>
          ["diff", "nor", "rough"].map((map) => `${asset}_${map}.jpg`),
        ),
        ...["diff", "nor", "rough", "disp"].map(
          (map) => `wood_trunk_wall_${map}.jpg`,
        ),
        SCAN,
      ].sort(),
    );
  });

  it("is fetched over https from those two places, each file pinned by its hash", () => {
    for (const source of TEXTURES) {
      expect(["dl.polyhaven.org", "3d-api.si.edu"]).toContain(
        new URL(source.url).hostname,
      );
      expect(new URL(source.url).protocol).toBe("https:");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("is kept in a cache of its own, outside what is committed", () => {
    expect(TEXTURE_DIR).toMatch(
      /node_modules\/\.cache\/modular-av-hides-textures$/,
    );
  });
});
