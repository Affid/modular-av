import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ART_DIR, artFiles, staleArt, writeArt } from "./files.ts";

const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "vines-art-"));

describe("artFiles", () => {
  const files = artFiles();

  it("draws each corner's frame, the picture's shape, the speaking light, its vines in summer, autumn and bare, and the lianas it hangs on", () => {
    const corners = ["tl", "tr", "bl", "br"].flatMap((corner) => [
      `frame-${corner}.svg`,
      `shape-${corner}.svg`,
      `light-${corner}.svg`,
      `vines-${corner}-green.svg`,
      `leaves-${corner}-autumn.svg`,
      `vines-${corner}-bare.svg`,
      `hang-${corner}.svg`,
      `loose-${corner}.svg`,
      `loose-short-${corner}.svg`,
      `knots-${corner}.svg`,
    ]);

    expect(
      [...files.keys()]
        .filter((name) => /-(tl|tr|bl|br)[.-]/.test(name))
        .sort(),
    ).toEqual(corners.sort());
  });

  it("draws the dock's own plant once: the trunk both ways, four boughs, the branch in three sizes, and what a name hangs on", () => {
    expect(
      [...files.keys()]
        .filter((name) => !/-(tl|tr|bl|br)[.-]/.test(name))
        .sort(),
    ).toEqual(
      [
        "trunk.svg",
        "trunk-across.svg",
        "bough-top.svg",
        "bough-header.svg",
        "bough-panel.svg",
        "bough-foot.svg",
        "branch-small.svg",
        "branch-medium.svg",
        "branch-large.svg",
        "plate.svg",
        "loop.svg",
        "meter.svg",
      ].sort(),
    );
  });

  it("gives each corner's frame lianas tied in its own places", () => {
    for (const kind of ["hang", "loose", "loose-short", "knots"]) {
      const pictures = ["tl", "tr", "bl", "br"].map((c) =>
        files.get(`${kind}-${c}.svg`),
      );

      expect(new Set(pictures).size).toBe(4);
    }
  });

  it("draws the main boughs thicker than the lesser ones, and no two alike", () => {
    const boughs = ["top", "header", "panel", "foot"].map(
      (name) => files.get(`bough-${name}.svg`) ?? "",
    );

    expect(new Set(boughs).size).toBe(4);
    for (const main of [boughs[1], boughs[2]])
      expect(main).toContain('id="bd"');
    for (const lesser of [boughs[0], boughs[3]])
      expect(lesser).not.toContain('id="bd"');
  });

  it("gives each corner a frame of its own shape", () => {
    for (const kind of ["frame", "shape", "light"]) {
      const pictures = ["tl", "tr", "bl", "br"].map((c) =>
        files.get(`${kind}-${c}.svg`),
      );

      expect(new Set(pictures).size).toBe(4);
    }
  });

  it("grows each corner's vines differently", () => {
    const summers = ["tl", "tr", "bl", "br"].map((c) =>
      files.get(`vines-${c}-green.svg`),
    );

    expect(new Set(summers).size).toBe(4);
  });

  it("stays light enough to ship with a theme", () => {
    const total = [...files.values()].reduce(
      (sum, text) => sum + text.length,
      0,
    );

    // About half of it is the four frames; a page loads only the pictures it shows.
    expect(total).toBeLessThan(800_000);
  });
});

describe("writeArt and staleArt", () => {
  it("reports every file of an empty folder as stale", async () => {
    const dir = await scratch();

    expect([...(await staleArt(dir))].sort()).toEqual(
      [...artFiles().keys()].sort(),
    );
  });

  it("writes the art, after which nothing is stale", async () => {
    const dir = await scratch();

    await writeArt(dir);

    expect(await staleArt(dir)).toEqual([]);
    expect(await readFile(join(dir, "frame-tl.svg"), "utf8")).toBe(
      artFiles().get("frame-tl.svg"),
    );
  });

  it("creates the folder when it is missing", async () => {
    const dir = join(await scratch(), "frames");

    await writeArt(dir);

    expect(await staleArt(dir)).toEqual([]);
  });

  it("reports a file someone edited", async () => {
    const dir = await scratch();
    await writeArt(dir);
    await writeFile(join(dir, "frame-tl.svg"), "<svg/>");

    expect(await staleArt(dir)).toEqual(["frame-tl.svg"]);
  });

  it("reports and removes a picture the generator no longer draws, and nothing else", async () => {
    const dir = await scratch();
    await writeArt(dir);
    await writeFile(join(dir, "vine-corner.svg"), "<svg/>");
    await writeFile(join(dir, "notes.txt"), "kept");

    expect(await staleArt(dir)).toEqual(["vine-corner.svg"]);

    await writeArt(dir);

    const names = await readdir(dir);
    expect(names).not.toContain("vine-corner.svg");
    expect(names).toContain("notes.txt");
    expect(await staleArt(dir)).toEqual([]);
  });

  it("fails on a folder it can't read, rather than call its pictures stale", async () => {
    const dir = await scratch();
    const notAFolder = join(dir, "notes.txt");
    await writeFile(notAFolder, "kept");

    await expect(staleArt(notAFolder)).rejects.toThrow(/ENOTDIR/);
    await expect(writeArt(notAFolder)).rejects.toThrow();
  });
});

describe("the theme's shipped art", () => {
  it("is what the generator draws (run `pnpm art:vines` after changing it)", async () => {
    expect(await staleArt(ART_DIR)).toEqual([]);
  });
});
