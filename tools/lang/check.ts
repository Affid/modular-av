import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compareWithReference,
  type LangIssue,
  validateLanguageData,
} from "./validate.ts";

export interface FileIssue extends LangIssue {
  /** Relative to the module's package directory. */
  readonly file: string;
}

interface LanguageEntry {
  readonly lang: string;
  readonly path: string;
}

const REFERENCE_LANG = "en";
const LANG_DIR = "lang";

function languagesOf(
  manifest: Readonly<Record<string, unknown>>,
): readonly LanguageEntry[] {
  const languages = manifest.languages;
  if (!Array.isArray(languages)) return [];
  return languages.filter(
    (entry: unknown): entry is LanguageEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).lang === "string" &&
      typeof (entry as Record<string, unknown>).path === "string",
  );
}

type Loaded = { readonly data: unknown } | { readonly issue: FileIssue };

async function load(packageDir: string, file: string): Promise<Loaded> {
  let text: string;
  try {
    text = await readFile(join(packageDir, file), "utf8");
  } catch {
    return { issue: { file, path: "", message: "file not found" } };
  }
  try {
    return { data: JSON.parse(text) as unknown };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { issue: { file, path: "", message: `invalid JSON: ${reason}` } };
  }
}

async function unlistedFiles(
  packageDir: string,
  listed: readonly LanguageEntry[],
): Promise<readonly FileIssue[]> {
  const names = await readdir(join(packageDir, LANG_DIR)).catch(() => []);
  const listedPaths = new Set(listed.map((entry) => entry.path));
  return names
    .map((name) => `${LANG_DIR}/${name}`)
    .filter((file) => file.endsWith(".json") && !listedPaths.has(file))
    .map((file) => ({
      file,
      path: "",
      message: "not listed in module.json languages",
    }));
}

/** Checks every language file a module's `module.json` lists, and orphans. */
export async function checkModuleLanguages(
  packageDir: string,
): Promise<readonly FileIssue[]> {
  const manifest = JSON.parse(
    await readFile(join(packageDir, "module.json"), "utf8"),
  ) as Readonly<Record<string, unknown>>;
  const id = manifest.id;
  const entries = languagesOf(manifest);
  const manifestIssues: FileIssue[] = [
    ...(typeof id === "string"
      ? []
      : [
          {
            file: "module.json",
            path: "",
            message: "module.json has no string id",
          },
        ]),
    ...(entries.some((e) => e.lang === REFERENCE_LANG)
      ? []
      : [
          {
            file: "module.json",
            path: "",
            message: "module.json lists no English (en) language file",
          },
        ]),
  ];
  if (typeof id !== "string") return manifestIssues;

  const loaded = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      result: await load(packageDir, entry.path),
    })),
  );
  const reference = loaded.find(
    ({ entry }) => entry.lang === REFERENCE_LANG,
  )?.result;
  const fileIssues = loaded.flatMap(
    ({ entry, result }): readonly FileIssue[] => {
      if ("issue" in result) return [result.issue];
      const issues = [
        ...validateLanguageData(result.data, id),
        ...(entry.lang !== REFERENCE_LANG && reference && "data" in reference
          ? compareWithReference(result.data, reference.data)
          : []),
      ];
      return issues.map((issue) => ({ file: entry.path, ...issue }));
    },
  );
  return [
    ...manifestIssues,
    ...fileIssues,
    ...(await unlistedFiles(packageDir, entries)),
  ];
}
