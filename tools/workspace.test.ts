import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listModulePackages } from "./workspace.ts";

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("listModulePackages", () => {
  it("lists only packages with a module.json and a version", async () => {
    // Arrange
    root = await mkdtemp(join(tmpdir(), "mav-ws-"));
    const pkg = async (
      name: string,
      files: Record<string, object>,
    ): Promise<void> => {
      await mkdir(join(root ?? "", "packages", name), { recursive: true });
      for (const [file, content] of Object.entries(files)) {
        await writeFile(
          join(root ?? "", "packages", name, file),
          JSON.stringify(content),
        );
      }
    };
    await pkg("core", {
      "module.json": { id: "modular-av" },
      "package.json": { version: "1.0.0" },
    });
    await pkg("api", { "package.json": { version: "1.0.0" } });
    await pkg("odd", {
      "module.json": { title: "no id" },
      "package.json": { version: "1.0.0" },
    });

    // Act
    const modules = await listModulePackages(root);

    // Assert
    expect(modules).toEqual([
      {
        dir: join(root, "packages", "core"),
        id: "modular-av",
        version: "1.0.0",
      },
    ]);
  });
});
