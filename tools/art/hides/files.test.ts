import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ART_DIR, drawnFiles, staleDrawn, writeDrawn } from "./files.ts";
import { readManifest, renderedNames, staleRendered } from "./rendered.ts";

const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "hides-art-"));

describe("the hides theme's drawn pictures", () => {
  it("are one: the tally marks, which the level meter is cut to", () => {
    expect([...drawnFiles().keys()]).toEqual(["tally.svg"]);
  });

  it("are written whole, and found stale once changed", async () => {
    const dir = await scratch();

    expect(await staleDrawn(dir)).toEqual(["tally.svg"]);
    await writeDrawn(dir);
    expect(await staleDrawn(dir)).toEqual([]);
    expect(await readFile(join(dir, "tally.svg"), "utf8")).toBe(
      drawnFiles().get("tally.svg"),
    );
    await writeFile(join(dir, "tally.svg"), "<svg/>");
    expect(await staleDrawn(dir)).toEqual(["tally.svg"]);
  });
});

describe("the art the module ships", () => {
  it("is what the script draws", async () => {
    expect(await staleDrawn(ART_DIR)).toEqual([]);
  });

  it("is the rendered pictures the render script listed, every one of them", async () => {
    const manifest = await readManifest();

    expect(Object.keys(manifest).sort()).toEqual([...renderedNames()].sort());
    expect(await staleRendered(ART_DIR, manifest)).toEqual([]);
  });

  it("weighs under 600 KB together: a hide's leather, lacing and wood are fine detail, and there are four", async () => {
    const manifest = await readManifest();
    const bytes = Object.values(manifest).reduce((sum, p) => sum + p.bytes, 0);

    expect(bytes).toBeLessThan(600_000);
  });
});
