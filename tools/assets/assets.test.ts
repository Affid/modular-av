import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAssets } from "./assets.ts";

/** A module package with one dependency that exports `./model.wasm`. */
async function modulePackage(assets: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assets-"));
  const dep = join(dir, "node_modules", "@scope", "models");
  await mkdir(join(dep, "dist"), { recursive: true });
  await writeFile(
    join(dep, "package.json"),
    JSON.stringify({
      name: "@scope/models",
      exports: {
        "./model.wasm": "./dist/model.wasm",
        "./worklet.js": { types: "./dist/w.d.ts", default: "./dist/w.js" },
      },
    }),
  );
  await writeFile(join(dep, "dist", "model.wasm"), "wasm");
  await writeFile(join(dep, "dist", "w.js"), "worklet");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "m", modularAV: { assets } }),
  );
  return dir;
}

describe("readAssets", () => {
  it("resolves each published path to the package's exported file", async () => {
    const dir = await modulePackage({
      "models/model.wasm": "@scope/models/model.wasm",
      "models/worklet.js": "@scope/models/worklet.js",
    });

    const assets = readAssets(dir);

    expect([...assets]).toEqual([
      [
        "models/model.wasm",
        join(dir, "node_modules", "@scope", "models", "dist", "model.wasm"),
      ],
      [
        "models/worklet.js",
        join(dir, "node_modules", "@scope", "models", "dist", "w.js"),
      ],
    ]);
  });

  it("has none for a package that declares none", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assets-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "m" }));

    expect(readAssets(dir).size).toBe(0);
  });

  it.each(["../escape.wasm", "/abs.wasm", "a/../b.wasm", "a//b.wasm", ""])(
    "refuses the published path %j",
    async (path) => {
      const dir = await modulePackage({ [path]: "@scope/models/model.wasm" });

      expect(() => readAssets(dir)).toThrow(/published path/);
    },
  );

  it.each([
    "./local.wasm",
    "/abs/model.wasm",
    "@scope/models/../x",
    "@scope/models",
  ])("refuses the source %j: only a file a package exports", async (source) => {
    const dir = await modulePackage({ "models/x.wasm": source });

    expect(() => readAssets(dir)).toThrow(/package export/);
  });

  it("says which export it can't find", async () => {
    const dir = await modulePackage({
      "models/x.wasm": "@scope/models/none.wasm",
    });

    expect(() => readAssets(dir)).toThrow(/@scope\/models\/none\.wasm/);
  });

  it("refuses a map that isn't an object of strings", async () => {
    const dir = await modulePackage({ "models/x.wasm": 3 });

    expect(() => readAssets(dir)).toThrow(/modularAV\.assets/);
  });
});
