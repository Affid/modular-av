import { describe, expect, it } from "vitest";
import { ART_DIR } from "./files.ts";
import { readManifest, renderedNames, staleRendered } from "./rendered.ts";

describe("the art the mirrors module ships", () => {
  it("is in the module's own folder of pictures", () => {
    expect(ART_DIR).toMatch(/packages\/dock-mirrors\/public\/art$/);
  });

  it("is the rendered pictures the render script listed, every one of them", async () => {
    const manifest = await readManifest();

    expect(Object.keys(manifest).sort()).toEqual([...renderedNames()].sort());
    expect(await staleRendered(ART_DIR, manifest)).toEqual([]);
  });

  it("weighs under 450 KB together: the hands and the fog lie over a camera, the rest is small", async () => {
    const manifest = await readManifest();
    const bytes = Object.values(manifest).reduce((sum, p) => sum + p.bytes, 0);

    expect(bytes).toBeLessThan(450_000);
  });
});
