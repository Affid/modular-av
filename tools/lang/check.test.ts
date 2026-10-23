import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkModuleLanguages } from "./check.ts";

let dir: string;

async function write(path: string, content: unknown): Promise<void> {
  await mkdir(join(dir, path, ".."), { recursive: true });
  await writeFile(
    join(dir, path),
    typeof content === "string" ? content : JSON.stringify(content),
  );
}

function manifest(
  languages: readonly { lang: string; path: string }[],
): object {
  return {
    id: "modular-av",
    languages: languages.map((l) => ({ ...l, name: l.lang })),
  };
}

describe("checkModuleLanguages", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mav-lang-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes a module with valid language files", async () => {
    // Arrange
    await write(
      "module.json",
      manifest([
        { lang: "en", path: "lang/en.json" },
        { lang: "de", path: "lang/de.json" },
      ]),
    );
    await write("lang/en.json", { "modular-av": { hello: "Hello" } });
    await write("lang/de.json", { "modular-av": { hello: "Hallo" } });

    // Act
    const issues = await checkModuleLanguages(dir);

    // Assert
    expect(issues).toEqual([]);
  });

  it("reports invalid JSON, missing files and unlisted files", async () => {
    await write(
      "module.json",
      manifest([
        { lang: "en", path: "lang/en.json" },
        { lang: "fr", path: "lang/fr.json" },
      ]),
    );
    await write("lang/en.json", "{ not json");
    await write("lang/es.json", { "modular-av": {} });

    const issues = await checkModuleLanguages(dir);

    expect(issues.map((i) => [i.file, i.message.split(":")[0]])).toEqual([
      ["lang/en.json", "invalid JSON"],
      ["lang/fr.json", "file not found"],
      ["lang/es.json", "not listed in module.json languages"],
    ]);
  });

  it("checks other languages against English", async () => {
    await write(
      "module.json",
      manifest([
        { lang: "en", path: "lang/en.json" },
        { lang: "de", path: "lang/de.json" },
      ]),
    );
    await write("lang/en.json", { "modular-av": { hello: "Hello" } });
    await write("lang/de.json", {
      "modular-av": { hello: "Hallo", extra: "x" },
    });

    const issues = await checkModuleLanguages(dir);

    expect(issues).toEqual([
      {
        file: "lang/de.json",
        path: "modular-av.extra",
        message: "is not in the reference language file",
      },
    ]);
  });

  it("requires an English file and a module id", async () => {
    await write("module.json", { languages: [] });

    const issues = await checkModuleLanguages(dir);

    expect(issues.map((i) => i.message)).toEqual([
      "module.json has no string id",
      "module.json lists no English (en) language file",
    ]);
  });
});
