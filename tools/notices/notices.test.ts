import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  disallowed,
  isAllowedLicense,
  packageDirs,
  readPackage,
  renderNotices,
  withDependencies,
} from "./notices.ts";

const NM = join("/repo", "node_modules");

describe("packageDirs", () => {
  it("finds plain and scoped packages, innermost node_modules first", () => {
    const ids = [
      join(NM, "livekit-client", "dist", "livekit-client.esm.mjs"),
      join(NM, "livekit-client", "dist", "other.mjs"),
      join(NM, "@livekit", "protocol", "dist", "index.mjs"),
      join(NM, ".pnpm", "jose@6", "node_modules", "jose", "dist", "a.js"),
      "\0" + join(NM, "tslib", "tslib.es6.mjs") + "?commonjs-proxy",
      join("/repo", "packages", "livekit", "src", "index.ts"),
      join(NM, "lonely"),
    ];

    expect(packageDirs(ids)).toEqual([
      join(NM, ".pnpm", "jose@6", "node_modules", "jose"),
      join(NM, "@livekit", "protocol"),
      join(NM, "livekit-client"),
      join(NM, "tslib"),
    ]);
  });
});

describe("withDependencies", () => {
  it("adds runtime dependencies found above, recursively, once each", async () => {
    // Arrange: root/node_modules/{a, b, @s/c}; a needs b and @s/c; c needs b.
    const root = await mkdtemp(join(tmpdir(), "deps-"));
    const nm = join(root, "node_modules");
    const pkg = async (dir: string, deps: Record<string, string>) => {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ dependencies: deps }),
      );
    };
    await pkg(join(nm, "a"), { b: "1", "@s/c": "1", missing: "1" });
    await pkg(join(nm, "b"), {});
    await pkg(join(nm, "@s", "c"), { b: "1" });

    // Act
    const dirs = await withDependencies([join(nm, "a")]);

    // Assert
    expect(dirs).toEqual([join(nm, "@s", "c"), join(nm, "a"), join(nm, "b")]);
  });
});

describe("readPackage", () => {
  it("reads the name, version, licence and its texts", async () => {
    // Arrange
    const dir = await mkdtemp(join(tmpdir(), "notices-"));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "pkg", version: "1.2.3", license: "Apache-2.0" }),
    );
    await writeFile(join(dir, "LICENSE"), "Apache text\n");
    await writeFile(join(dir, "NOTICE.md"), "Notice text");
    await writeFile(join(dir, "README.md"), "not a licence");

    // Act
    const pkg = await readPackage(dir);

    // Assert
    expect(pkg).toEqual({
      name: "pkg",
      version: "1.2.3",
      license: "Apache-2.0",
      texts: ["Apache text", "Notice text"],
    });
  });

  it("marks missing fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "notices-"));
    await writeFile(join(dir, "package.json"), "{}");

    const pkg = await readPackage(dir);

    expect(pkg).toMatchObject({ version: "?", license: "UNKNOWN", texts: [] });
  });
});

describe("renderNotices", () => {
  const header = "# Third-party notices: x\n\nIntro.\n";

  it("keeps the header alone when nothing is bundled", () => {
    expect(renderNotices(header, [])).toBe(header);
  });

  it("appends each package with its licence texts", () => {
    const out = renderNotices(header, [
      { name: "a", version: "1", license: "MIT", texts: ["MIT text"] },
      { name: "b", version: "2", license: "ISC", texts: [] },
    ]);

    expect(out).toContain("## Bundled packages");
    expect(out).toContain("### a 1 (MIT)\n\n```text\nMIT text\n```");
    expect(out).toContain("### b 2 (ISC)\n\nNo licence file");
  });
});

describe("disallowed", () => {
  it("flags licences outside MIT, ISC, BSD and Apache", () => {
    const pkgs = [
      { name: "ok", version: "1", license: "Apache-2.0", texts: [] },
      { name: "krisp", version: "1", license: "SEE LICENSE IN x", texts: [] },
    ];

    expect(disallowed(pkgs).map((p) => p.name)).toEqual(["krisp"]);
  });
});

describe("isAllowedLicense", () => {
  it("reads SPDX AND and OR expressions", () => {
    expect(isAllowedLicense("(Apache-2.0 AND BSD-3-Clause)")).toBe(true);
    expect(isAllowedLicense("MIT OR GPL-3.0")).toBe(true);
    expect(isAllowedLicense("MIT AND GPL-3.0")).toBe(false);
    expect(isAllowedLicense("UNKNOWN")).toBe(false);
  });
});
