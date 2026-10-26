import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "../workspace.ts";
import { isSafePath } from "./assets.ts";
import { extractFromTarGz } from "./tar.ts";

/**
 * Files a module serves that no npm package carries (MediaPipe's models
 * are published only on Google's storage): listed in its package.json as
 * `modularAV.downloads`, published path → `{ url, sha256 }`, a versioned
 * URL and the file's hash. The build and the test harness fetch each once
 * into a cache outside the repository and check it, so nothing is
 * vendored (handoff §2) and a changed file can't slip in. `extract`
 * takes one file out of a `.tgz` (a release asset that is no npm
 * package, e.g. lib-jitsi-meet); the hash is then the archive's.
 */
export interface Download {
  readonly url: string;
  readonly sha256: string;
  readonly extract?: string;
}

export const DOWNLOAD_CACHE = join(
  ROOT,
  "node_modules",
  ".cache",
  "modular-av-downloads",
);

/** A download that takes longer fails the build rather than hanging it. */
const DOWNLOAD_TIMEOUT_MS = 120_000;

const isDownload = (value: unknown): value is Download =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Download).url === "string" &&
  typeof (value as Download).sha256 === "string";

function check(packageDir: string, path: string, value: unknown): Download {
  if (!isSafePath(path))
    throw new Error(
      `${packageDir}: unsafe published path ${JSON.stringify(path)}`,
    );
  if (!isDownload(value))
    throw new Error(`${packageDir}: ${path} needs a url and sha256`);
  if (!value.url.startsWith("https://"))
    throw new Error(`${packageDir}: ${path} must download over https`);
  if (!/^[0-9a-f]{64}$/.test(value.sha256))
    throw new Error(`${packageDir}: ${path} needs a sha256 of 64 hex digits`);
  const extract: unknown = (value as { extract?: unknown }).extract;
  if (extract === undefined) return { url: value.url, sha256: value.sha256 };
  if (typeof extract !== "string" || !isSafePath(extract))
    throw new Error(`${packageDir}: ${path} has an unsafe extract path`);
  return { url: value.url, sha256: value.sha256, extract };
}

export function readDownloads(
  packageDir: string,
): ReadonlyMap<string, Download> {
  const pkg = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as { modularAV?: { downloads?: unknown } };
  const downloads = pkg.modularAV?.downloads;
  if (downloads === undefined) return new Map();
  if (typeof downloads !== "object" || downloads === null)
    throw new Error(`${packageDir}: modularAV.downloads must be an object`);
  return new Map(
    Object.entries(downloads).map(
      ([path, value]) => [path, check(packageDir, path, value)] as const,
    ),
  );
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

async function cached(file: string, hash: string): Promise<boolean> {
  try {
    return sha256(await readFile(file)) === hash;
  } catch {
    // Not downloaded yet.
    return false;
  }
}

async function download(
  path: string,
  item: Download,
  file: string,
  fetcher: typeof fetch,
): Promise<void> {
  const response = await fetcher(item.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(
      `${path}: download failed with HTTP ${String(response.status)} (${item.url})`,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const got = sha256(bytes);
  if (got !== item.sha256)
    throw new Error(
      `${path}: sha256 ${got} doesn't match the pinned ${item.sha256} (${item.url})`,
    );
  // A unique partial name: two paths may pin the same file.
  await writeWhole(file, bytes);
}

/** Writes aside, then moves: a cut-off write never looks complete. */
async function writeWhole(file: string, bytes: Uint8Array): Promise<void> {
  const partial = `${file}.${randomUUID()}.partial`;
  try {
    await writeFile(partial, bytes);
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
}

/** The file out of a checked archive, written next to it in the cache. */
async function extracted(archive: string, inside: string): Promise<string> {
  const name = createHash("sha256").update(inside).digest("hex").slice(0, 16);
  const file = `${archive}.${name}`;
  await writeWhole(file, extractFromTarGz(await readFile(archive), inside));
  return file;
}

/** Published path → the checked file in the cache, downloading what's missing. */
export async function fetchDownloads(
  packageDir: string,
  options: { cacheDir?: string; fetcher?: typeof fetch } = {},
): Promise<ReadonlyMap<string, string>> {
  const cacheDir = options.cacheDir ?? DOWNLOAD_CACHE;
  const fetcher = options.fetcher ?? fetch;
  const downloads = readDownloads(packageDir);
  if (downloads.size > 0) await mkdir(cacheDir, { recursive: true });
  const entries = await Promise.all(
    [...downloads].map(async ([path, item]) => {
      const file = join(cacheDir, item.sha256);
      if (!(await cached(file, item.sha256)))
        await download(path, item, file, fetcher);
      // Taken out again each time, from the archive just checked.
      return [
        path,
        item.extract ? await extracted(file, item.extract) : file,
      ] as const;
    }),
  );
  return new Map(entries);
}
