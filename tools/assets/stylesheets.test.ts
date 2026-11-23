import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinStylesheet, readStylesheets } from "./stylesheets.ts";

/** A module package with `files` (path → text) and `stylesheets` as its option. */
async function modulePackage(
  stylesheets: unknown,
  files: Readonly<Record<string, string>> = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "stylesheets-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "m", modularAV: { stylesheets } }),
  );
  return dir;
}

describe("readStylesheets", () => {
  it("maps each published stylesheet to its parts in the package, in order", async () => {
    const dir = await modulePackage(
      { "theme.css": ["styles/b.css", "styles/a.css"] },
      { "styles/a.css": "a", "styles/b.css": "b" },
    );

    const sheets = readStylesheets(dir);

    expect([...sheets]).toEqual([
      [
        "theme.css",
        [join(dir, "styles", "b.css"), join(dir, "styles", "a.css")],
      ],
    ]);
  });

  it("has none for a package that declares none", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stylesheets-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "m" }));

    expect(readStylesheets(dir).size).toBe(0);
  });

  it.each(["../theme.css", "/theme.css", "a//theme.css", "theme.js", ""])(
    "refuses the published path %j",
    async (path) => {
      const dir = await modulePackage(
        { [path]: ["styles/a.css"] },
        { "styles/a.css": "a" },
      );

      expect(() => readStylesheets(dir)).toThrow(/unsafe published path/);
    },
  );

  it.each(["../a.css", "/etc/a.css", "styles/../../a.css", "styles/a.txt"])(
    "refuses the part %j",
    async (part) => {
      const dir = await modulePackage({ "theme.css": [part] });

      expect(() => readStylesheets(dir)).toThrow(/unsafe part/);
    },
  );

  it("refuses a part that isn't there", async () => {
    const dir = await modulePackage({ "theme.css": ["styles/gone.css"] });

    expect(() => readStylesheets(dir)).toThrow(/styles\/gone\.css/);
  });

  it.each([[["styles/a.css"]], { "theme.css": [] }, { "theme.css": [1] }])(
    "refuses a malformed option %j",
    async (option) => {
      const dir = await modulePackage(option, { "styles/a.css": "a" });

      expect(() => readStylesheets(dir)).toThrow(
        /modularAV.stylesheets must map/,
      );
    },
  );
});

describe("joinStylesheet", () => {
  it("joins the parts in order, each ending on its own line", async () => {
    const dir = await modulePackage(
      {},
      { "a.css": ".a {}\n", "b.css": ".b {}" },
    );

    expect(joinStylesheet([join(dir, "a.css"), join(dir, "b.css")])).toBe(
      ".a {}\n\n.b {}\n",
    );
  });
});
