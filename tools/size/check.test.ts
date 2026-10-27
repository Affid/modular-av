import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkEntrySize, checkStyleSizes, checkWorkerSizes } from "./check.ts";

let dir: string;

async function setup(budget: unknown, entry?: string): Promise<void> {
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      version: "1.0.0",
      ...(budget === undefined
        ? {}
        : { modularAV: { entryBudgetBytes: budget } }),
    }),
  );
  if (entry !== undefined) {
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist", "modular-av.js"), entry);
  }
}

describe("checkEntrySize", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mav-size-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes an entry within its budget", async () => {
    // Arrange
    await setup(10, "12345");

    // Act
    const result = await checkEntrySize({
      dir,
      id: "modular-av",
      version: "1.0.0",
    });

    // Assert
    expect(result).toEqual({
      id: "modular-av",
      bytes: 5,
      budget: 10,
      problem: undefined,
    });
  });

  it("fails an entry over its budget", async () => {
    await setup(4, "12345");

    const result = await checkEntrySize({
      dir,
      id: "modular-av",
      version: "1.0.0",
    });

    expect(result.problem).toBe("entry is 5 bytes, over its budget of 4");
  });

  it("counts the chunks it imports at load, not those it loads later", async () => {
    // Arrange: 1 + 2 bytes loaded with the entry, 100 later.
    const entry =
      'import { a } from "./shared-1.js";\nimport("./lazy-2.js");\n';
    await setup(1000, entry);
    await writeFile(
      join(dir, "dist", "shared-1.js"),
      'import "./deep-3.js";\n',
    );
    await writeFile(join(dir, "dist", "deep-3.js"), "12");
    await writeFile(join(dir, "dist", "lazy-2.js"), "x".repeat(100));

    // Act
    const result = await checkEntrySize({
      dir,
      id: "modular-av",
      version: "1.0.0",
    });

    // Assert
    expect(result.bytes).toBe(
      entry.length + 'import "./deep-3.js";\n'.length + 2,
    );
  });

  it("requires a budget and a build", async () => {
    await setup(undefined, "x");
    const noBudget = await checkEntrySize({
      dir,
      id: "modular-av",
      version: "1.0.0",
    });
    await setup(10);
    await rm(join(dir, "dist"), { recursive: true, force: true });
    const noBuild = await checkEntrySize({
      dir,
      id: "modular-av",
      version: "1.0.0",
    });

    expect(noBudget.problem).toBe(
      "package.json has no modularAV.entryBudgetBytes",
    );
    expect(noBuild.problem).toBe("dist/modular-av.js not found: build first");
  });
});

describe("checkStyleSizes", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mav-size-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const mod = (): { dir: string; id: string; version: string } => ({
    dir,
    id: "modular-av-dock",
    version: "1.0.0",
  });

  async function styles(
    budget: unknown,
    css?: string,
    file = "modular-av-dock.css",
  ): Promise<void> {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        ...(budget === undefined
          ? {}
          : { modularAV: { styleBudgetBytes: budget } }),
      }),
    );
    if (css === undefined) return;
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist", file), css);
  }

  it("skips a module without styles", async () => {
    await styles(10);

    expect(await checkStyleSizes(mod())).toEqual([]);
  });

  it("passes styles within their budget and fails those over it", async () => {
    await styles(4, "a{}");
    expect((await checkStyleSizes(mod()))[0]?.problem).toBeUndefined();

    await styles(2, "a{}");
    expect((await checkStyleSizes(mod()))[0]?.problem).toMatch(
      /over their budget of 2/,
    );
  });

  it("checks a theme's own stylesheet, served from public/", async () => {
    await styles(2, "a{color:red}", "vines.css");

    const [result] = await checkStyleSizes(mod());

    expect(result?.id).toBe("modular-av-dock/vines.css");
    expect(result?.problem).toMatch(/over their budget of 2/);
  });

  it("fails styles without a budget", async () => {
    await styles(undefined, "a{}");

    expect((await checkStyleSizes(mod()))[0]?.problem).toMatch(
      /styleBudgetBytes/,
    );
  });
});

describe("checkWorkerSizes", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mav-size-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const mod = (): { dir: string; id: string; version: string } => ({
    dir,
    id: "modular-av-cam-background",
    version: "1.0.0",
  });

  async function worker(budget: unknown): Promise<void> {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        modularAV: {
          workers: { "worker.js": "src/worker/main.ts" },
          ...(budget === undefined ? {} : { workerBudgetBytes: budget }),
        },
      }),
    );
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist", "worker.js"), 'import "./p-1.js";\n');
    await writeFile(join(dir, "dist", "p-1.js"), "1234");
  }

  it("checks each worker with what it imports against the workers' budget", async () => {
    await worker(100);

    expect(await checkWorkerSizes(mod())).toEqual([
      {
        id: "modular-av-cam-background/worker.js",
        bytes: 'import "./p-1.js";\n'.length + 4,
        budget: 100,
        problem: undefined,
      },
    ]);
  });

  it("fails a worker over its budget, or without one", async () => {
    await worker(5);
    expect((await checkWorkerSizes(mod()))[0]?.problem).toMatch(
      /over its budget of 5/,
    );

    await worker(undefined);
    expect((await checkWorkerSizes(mod()))[0]?.problem).toMatch(
      /workerBudgetBytes/,
    );
  });

  it("has nothing to check in a module without workers", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({}));

    expect(await checkWorkerSizes(mod())).toEqual([]);
  });
});
