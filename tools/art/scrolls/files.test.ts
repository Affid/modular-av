import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ART_DIR, drawnFiles, staleDrawn, writeDrawn } from "./files.ts";
import {
  expectedSize,
  readManifest,
  renderedNames,
  staleRendered,
} from "./rendered.ts";

const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "scrolls-art-"));

describe("drawnFiles", () => {
  const files = drawnFiles();

  it("draws four hands of writing: the ink, the signs alone and their glow", () => {
    expect(
      [...files.keys()]
        .filter((name) => /^(ink|signs|halo)-/.test(name))
        .sort(),
    ).toEqual(
      [1, 2, 3, 4]
        .flatMap((k) => [`ink-${k}.svg`, `signs-${k}.svg`, `halo-${k}.svg`])
        .sort(),
    );
  });

  it("draws the cracks for each scroll's stones, and a button's facets whole and in two parts", () => {
    expect(
      [...files.keys()]
        .filter((name) => !/^(ink|signs|halo)-/.test(name))
        .sort(),
    ).toEqual([
      "button-left.svg",
      "button-right.svg",
      "button.svg",
      "cracks-1.svg",
      "cracks-2.svg",
    ]);
  });

  it("draws no picture twice", () => {
    expect(new Set(files.values()).size).toBe(files.size);
  });
});

describe("writeDrawn and staleDrawn", () => {
  it("writes the drawn pictures, after which none is stale", async () => {
    const dir = await scratch();

    expect([...(await staleDrawn(dir))].sort()).toEqual(
      [...drawnFiles().keys()].sort(),
    );
    await writeDrawn(dir);

    expect(await staleDrawn(dir)).toEqual([]);
    expect(await readFile(join(dir, "button.svg"), "utf8")).toBe(
      drawnFiles().get("button.svg"),
    );
  });

  it("reports a picture someone edited, and leaves the rendered pictures alone", async () => {
    const dir = await scratch();
    await writeDrawn(dir);
    await writeFile(join(dir, "ink-1.svg"), "<svg/>");
    await writeFile(join(dir, "desk.webp"), "rendered");

    expect(await staleDrawn(dir)).toEqual(["ink-1.svg"]);
    await writeDrawn(dir);

    expect(await readFile(join(dir, "desk.webp"), "utf8")).toBe("rendered");
  });
});

describe("the theme's shipped art", () => {
  it("has the drawn pictures as the script draws them (run `pnpm art:scrolls` after changing it)", async () => {
    expect(await staleDrawn(ART_DIR)).toEqual([]);
  });

  it("has the rendered pictures as they were last rendered (`pnpm art:scrolls:render` renders and lists them)", async () => {
    const manifest = await readManifest();

    expect(Object.keys(manifest).sort()).toEqual([...renderedNames()].sort());
    expect(await staleRendered(ART_DIR, manifest)).toEqual([]);
  });

  it("has each rendered picture at the size the measures give it (render again after changing a measure)", async () => {
    for (const [name, { width, height }] of Object.entries(
      await readManifest(),
    ))
      expect({ name, width, height }).toEqual({
        name,
        ...expectedSize(name),
      });
  });

  it("stays light enough to ship with a theme", async () => {
    const manifest = await readManifest();
    const drawn = [...drawnFiles().values()].reduce(
      (sum, text) => sum + text.length,
      0,
    );
    const renders = Object.values(manifest).reduce(
      (sum, picture) => sum + picture.bytes,
      0,
    );

    // A page loads only the pictures it shows: one hand's and one scroll's for a single camera.
    expect(drawn + renders).toBeLessThan(ART_BUDGET_BYTES);
  });
});

/** Every picture together. The vines theme's are 800,000. */
const ART_BUDGET_BYTES = 560_000;
