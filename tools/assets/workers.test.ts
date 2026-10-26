import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readWorkers } from "./workers.ts";

async function modulePackage(workers: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "workers-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "m", modularAV: { workers } }),
  );
  return dir;
}

describe("readWorkers", () => {
  it("maps each published script to its source, by entry name", async () => {
    const dir = await modulePackage({ "worker.js": "src/worker/main.ts" });

    expect(readWorkers(dir)).toEqual([
      {
        name: "worker",
        path: "worker.js",
        source: join(dir, "src", "worker", "main.ts"),
      },
    ]);
  });

  it("has none for a package that declares none", async () => {
    const dir = await mkdtemp(join(tmpdir(), "workers-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "m" }));

    expect(readWorkers(dir)).toEqual([]);
  });

  it.each([
    [{ "../w.js": "src/w.ts" }, /published path/],
    [{ "w.mjs": "src/w.ts" }, /\.js/],
    [{ "w.js": "../outside.ts" }, /src\//],
    [{ "w.js": "test/w.ts" }, /src\//],
    [{ "w.js": 3 }, /modularAV\.workers/],
  ])("refuses %j", async (workers, error) => {
    const dir = await modulePackage(workers);

    expect(() => readWorkers(dir)).toThrow(error);
  });
});
