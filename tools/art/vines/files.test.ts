import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ART_DIR, artFiles, staleArt, writeArt } from "./files.ts";

const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "vines-art-"));

describe("artFiles", () => {
  const files = artFiles();

  it("draws the lattice, and each corner's frame, the picture's shape, the speaking light, and its vines in summer, autumn and bare, scattered and in a grid", () => {
    expect([...files.keys()].sort()).toEqual(
      [
        "lattice.svg",
        ...["tl", "tr", "bl", "br"].flatMap((corner) => [
          `grid-vines-${corner}-green.svg`,
          `grid-leaves-${corner}-autumn.svg`,
          `grid-vines-${corner}-bare.svg`,
          `frame-${corner}.svg`,
          `shape-${corner}.svg`,
          `light-${corner}.svg`,
          `vines-${corner}-green.svg`,
          `leaves-${corner}-autumn.svg`,
          `vines-${corner}-bare.svg`,
        ]),
      ].sort(),
    );
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

    expect(total).toBeLessThan(600_000);
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
