import { describe, expect, it } from "vitest";
import { ART_DIR } from "./files.ts";
import { readManifest, renderedNames, staleRendered } from "./rendered.ts";

describe("the art the spaceship module ships", () => {
  it("is in the module's own folder of pictures", () => {
    expect(ART_DIR).toMatch(/packages\/dock-spaceship\/public\/art$/);
  });

  it("is the rendered pictures the render script listed, every one of them", async () => {
    const manifest = await readManifest();

    expect(Object.keys(manifest).sort()).toEqual([...renderedNames()].sort());
    expect(await staleRendered(ART_DIR, manifest)).toEqual([]);
  });

  it("weighs under 1.3 MB together: ten monitors under dusty glass are most of it", async () => {
    const manifest = await readManifest();
    const bytes = Object.values(manifest).reduce((sum, p) => sum + p.bytes, 0);

    expect(bytes).toBeLessThan(1_300_000);
  });
});
