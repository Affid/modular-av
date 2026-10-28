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
  it("builds its module.json, language files and licence into dist", async () => {
    // Arrange
    dir = await mkdtemp(join(tmpdir(), "mav-manifest-only-"));
    await writeFile(
      join(dir, "module.json"),
      JSON.stringify({
        id: "modular-av-starter-set",
        title: "Modular A/V: Starter set",
        relationships: {
          requires: [{ id: "modular-av-dock", type: "module" }],
        },
      }),
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ version: "0.9.0" }),
    );
    await mkdir(join(dir, "lang"));
    await writeFile(join(dir, "lang", "en.json"), '{"a":"b"}\n');

    // Act
    await buildManifestOnly(dir);

    // Assert
    const built = JSON.parse(
      await readFile(join(dir, "dist", "module.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(built).toMatchObject({
      id: "modular-av-starter-set",
      version: "0.9.0",
      relationships: {
        requires: [
          {
            id: "modular-av-dock",
            type: "module",
            compatibility: { minimum: "0.9.0" },
          },
        ],
      },
    });
    expect(await readFile(join(dir, "dist", "lang", "en.json"), "utf8")).toBe(
      '{"a":"b"}\n',
    );
    expect(await readFile(join(dir, "dist", "LICENSE"), "utf8")).toMatch(/MIT/);
  });
});
