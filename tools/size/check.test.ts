import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkEntrySize, checkStyleSize } from "./check.ts";

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

describe("checkStyleSize", () => {
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

  async function styles(budget: unknown, css?: string): Promise<void> {
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
    await writeFile(join(dir, "dist", "modular-av-dock.css"), css);
  }

  it("skips a module without styles", async () => {
    await styles(10);

    expect(await checkStyleSize(mod())).toBeUndefined();
  });

  it("passes styles within their budget and fails those over it", async () => {
    await styles(4, "a{}");
    expect((await checkStyleSize(mod()))?.problem).toBeUndefined();

    await styles(2, "a{}");
    expect((await checkStyleSize(mod()))?.problem).toMatch(
      /over their budget of 2/,
    );
  });

  it("fails styles without a budget", async () => {
    await styles(undefined, "a{}");

    expect((await checkStyleSize(mod()))?.problem).toMatch(/styleBudgetBytes/);
  });
});
