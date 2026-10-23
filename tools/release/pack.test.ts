import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packModule } from "./pack.ts";

let dist: string;

describe("packModule", () => {
  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), "mav-pack-"));
    await mkdir(join(dist, "lang"));
    await writeFile(join(dist, "modular-av.js"), "export {};\n");
    await writeFile(join(dist, "lang", "en.json"), "{}");
    await writeFile(
      join(dist, "module.json"),
      JSON.stringify({
        id: "modular-av",
        title: "Modular A/V",
        version: "0.1.0",
      }),
    );
  });

  afterEach(async () => {
    await rm(dist, { recursive: true, force: true });
  });

  it("zips dist/ with a module.json that carries the release URLs", async () => {
    // Act
    const { manifest, zip } = await packModule(dist, "modular-av", "0.1.0");

    // Assert
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      "lang/en.json",
      "modular-av.js",
      "module.json",
    ]);
    expect(
      JSON.parse(strFromU8(files["module.json"] ?? new Uint8Array())),
    ).toEqual(manifest);
    expect(manifest).toMatchObject({
      id: "modular-av",
      version: "0.1.0",
      download:
        "https://github.com/Affid/modular-av/releases/download/modular-av-v0.1.0/modular-av.zip",
    });
  });

  it("gives the same bytes for the same build", async () => {
    const first = await packModule(dist, "modular-av", "0.1.0");
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const second = await packModule(dist, "modular-av", "0.1.0");

    expect(Buffer.from(second.zip).equals(Buffer.from(first.zip))).toBe(true);
  });

  it("refuses a build whose version does not match the release", async () => {
    await expect(packModule(dist, "modular-av", "0.2.0")).rejects.toThrow(
      /dist\/module.json has version 0.1.0, expected 0.2.0/,
    );
  });

  it("refuses a build for another module", async () => {
    await expect(packModule(dist, "modular-av-dock", "0.1.0")).rejects.toThrow(
      /dist\/module.json is for "modular-av"/,
    );
  });
});
