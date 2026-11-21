import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describePicture,
  expectedSize,
  type Manifest,
  parseManifest,
  renderedNames,
  SCENES,
  staleRendered,
} from "./rendered.ts";

const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "rendered-"));

/** A WebP header that says `width` by `height`, with `tail` after it. */
function picture(width: number, height: number, tail = 0): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  return new Uint8Array([
    ...Buffer.from("RIFF", "ascii"),
    ...[17, 0, 0, 0],
    ...Buffer.from("WEBPVP8L", "ascii"),
    ...[5, 0, 0, 0],
    0x2f,
    bits & 0xff,
    (bits >> 8) & 0xff,
    (bits >> 16) & 0xff,
    (bits >> 24) & 0xff,
    tail,
  ]);
}

describe("the rendered pictures", () => {
  it("come from seven scenes: the desk, the scrolls, their stones, the plate, the paper, the things and the wand", () => {
    expect(SCENES.map((scene) => scene.script)).toEqual([
      "desk.py",
      "scroll.py",
      "stones.py",
      "plate.py",
      "paper.py",
      "things.py",
      "wand.py",
    ]);
  });

  it("are WebP files: two scrolls, and for each its stones, their shadow, flashes and glow", () => {
    expect([...renderedNames()].sort()).toEqual(
      [
        "desk.webp",
        "paper.webp",
        "plate.webp",
        "things.webp",
        "wand.webp",
        ...[1, 2].flatMap((k) =>
          ["scroll", "stones", "shadow", "spark", "glow"].map(
            (kind) => `${kind}-${k}.webp`,
          ),
        ),
      ].sort(),
    );
  });

  it("have the size the measures give each", () => {
    expect(expectedSize("desk.webp")).toEqual({ width: 1200, height: 1200 });
    expect(expectedSize("things.webp")).toEqual({ width: 720, height: 360 });
    // What fills the frame layer has a pixel to a tile unit.
    expect(expectedSize("scroll-2.webp")).toEqual({ width: 1150, height: 782 });
    expect(expectedSize("glow-1.webp")).toEqual({ width: 1150, height: 782 });
    expect(() => expectedSize("ghost.webp")).toThrow(/ghost\.webp/);
  });
});

describe("describePicture", () => {
  it("says a picture's size, weight and hash", () => {
    const bytes = picture(600, 1200);

    expect(describePicture(bytes)).toEqual({
      width: 600,
      height: 1200,
      bytes: bytes.length,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });
    expect(describePicture(picture(600, 1200, 1)).sha256).not.toBe(
      describePicture(bytes).sha256,
    );
  });
});

describe("parseManifest", () => {
  const entry = { width: 2, height: 3, bytes: 26, sha256: "a".repeat(64) };

  it("reads what the render script wrote", () => {
    expect(parseManifest(JSON.stringify({ "desk.webp": entry }))).toEqual({
      "desk.webp": entry,
    });
  });

  it.each([
    ["[]", /object/],
    [JSON.stringify({ "desk.webp": { ...entry, sha256: "short" } }), /desk/],
    [JSON.stringify({ "desk.webp": { ...entry, width: "2" } }), /desk/],
    [JSON.stringify({ "../desk.webp": entry }), /name/],
  ])("refuses a manifest that is not one: %s", (text, why) => {
    expect(() => parseManifest(text)).toThrow(why);
  });
});

describe("staleRendered", () => {
  const A = describePicture(picture(4, 2));
  const two = async (): Promise<{ dir: string; manifest: Manifest }> => {
    const dir = await scratch();
    const files = { "a.webp": picture(4, 2), "b.webp": picture(8, 2) };
    for (const [name, bytes] of Object.entries(files))
      await writeFile(join(dir, name), bytes);
    return {
      dir,
      manifest: { "a.webp": A, "b.webp": describePicture(files["b.webp"]) },
    };
  };

  it("finds nothing stale in a folder that is what the manifest says", async () => {
    const { dir, manifest } = await two();

    expect(await staleRendered(dir, manifest)).toEqual([]);
  });

  it("reports a picture that is missing, one that was changed, and one the manifest doesn't know", async () => {
    const { dir, manifest } = await two();
    await writeFile(join(dir, "b.webp"), picture(8, 2, 1));
    await writeFile(join(dir, "stray.webp"), picture(1, 1));
    await writeFile(join(dir, "ink.svg"), "<svg/>");

    expect(await staleRendered(dir, { ...manifest, "c.webp": A })).toEqual([
      "b.webp",
      "c.webp",
      "stray.webp",
    ]);
  });

  it("reports every picture of a folder that isn't there", async () => {
    const { manifest } = await two();

    expect(
      await staleRendered(join(await scratch(), "none"), manifest),
    ).toEqual(["a.webp", "b.webp"]);
  });
});
