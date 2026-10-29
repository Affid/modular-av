import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildManifestOnly } from "./manifest-only.ts";

let dir: string | null = null;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("a module without code", () => {
  it("builds its module.json (requiring what it was built with), language files and licence into dist", async () => {
    // Arrange
    dir = await mkdtemp(join(tmpdir(), "mav-manifest-only-"));
    const starter = join(dir, "packages", "starter-set");
    const dock = join(dir, "packages", "dock");
    await mkdir(join(starter, "lang"), { recursive: true });
    await mkdir(dock, { recursive: true });
    await writeFile(
      join(dock, "module.json"),
      JSON.stringify({ id: "modular-av-dock" }),
    );
    await writeFile(
      join(dock, "package.json"),
      JSON.stringify({ version: "1.2.0" }),
    );
    await writeFile(
      join(starter, "module.json"),
      JSON.stringify({
        id: "modular-av-starter-set",
        title: "Modular A/V: Starter set",
        relationships: {
          requires: [{ id: "modular-av-dock", type: "module" }],
        },
      }),
    );
    await writeFile(
      join(starter, "package.json"),
      JSON.stringify({ version: "0.9.0" }),
    );
    await writeFile(join(starter, "lang", "en.json"), '{"a":"b"}\n');

    // Act
    await buildManifestOnly(starter, dir);

    // Assert
    const built = JSON.parse(
      await readFile(join(starter, "dist", "module.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(built).toMatchObject({
      id: "modular-av-starter-set",
      version: "0.9.0",
      relationships: {
        requires: [
          {
            id: "modular-av-dock",
            type: "module",
            compatibility: { minimum: "1.2.0" },
          },
        ],
      },
    });
    expect(
      await readFile(join(starter, "dist", "lang", "en.json"), "utf8"),
    ).toBe('{"a":"b"}\n');
    expect(await readFile(join(starter, "dist", "LICENSE"), "utf8")).toMatch(
      /MIT/,
    );
  });
});
