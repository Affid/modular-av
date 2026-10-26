import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { readAssets } from "../../../../tools/assets/assets.ts";
import { fetchDownloads } from "../../../../tools/assets/downloads.ts";
import { readWorkers } from "../../../../tools/assets/workers.ts";
import { signalRelay } from "./signal-relay.ts";

export const HARNESS_PORT = 5174;

const PACKAGES = join(import.meta.dirname, "..", "..", "..");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  js: "text/javascript",
  wasm: "application/wasm",
  json: "application/json",
  svg: "image/svg+xml",
  webp: "image/webp",
  png: "image/png",
};

interface ModuleFiles {
  /** The package's `public/` directory, if it has one. */
  readonly pub: string | null;
  /** Files copied at build time (`modularAV.assets` and `.downloads`). */
  readonly assets: ReadonlyMap<string, string>;
  /** Worker scripts (`modularAV.workers`): published path → source. */
  readonly workers: ReadonlyMap<string, string>;
}

/** Module id → what Foundry would serve from its directory. */
async function moduleDirs(): Promise<ReadonlyMap<string, ModuleFiles>> {
  const dirs = readdirSync(PACKAGES).filter((dir) =>
    existsSync(join(PACKAGES, dir, "module.json")),
  );
  const entries = await Promise.all(
    dirs.map(async (dir) => {
      const manifest = join(PACKAGES, dir, "module.json");
      const pub = join(PACKAGES, dir, "public");
      const { id } = JSON.parse(readFileSync(manifest, "utf8")) as {
        id: string;
      };
      const downloads = await fetchDownloads(join(PACKAGES, dir));
      const files: ModuleFiles = {
        pub: existsSync(pub) ? pub : null,
        assets: new Map([...readAssets(join(PACKAGES, dir)), ...downloads]),
        workers: new Map(
          readWorkers(join(PACKAGES, dir)).map((w) => [w.path, w.source]),
        ),
      };
      return [id, files] as const;
    }),
  );
  return new Map(entries);
}

/** The file for `path` of a module, or null: its assets first, then `public/`. */
function fileOf(files: ModuleFiles | undefined, path: string): string | null {
  if (!files) return null;
  const asset = files.assets.get(path);
  if (asset) return asset;
  if (!files.pub) return null;
  const file = normalize(join(files.pub, path));
  return file.startsWith(files.pub + sep) && existsSync(file) ? file : null;
}

/** The cookie that fails module files for a worker's requests too. */
const BROKEN_COOKIE = "mav-broken";

/** A cookie value as text; a malformed one fails nothing. */
function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Not percent-encoded properly: matches no path.
    return "\u0000";
  }
}

/**
 * Whether the page asked for this module file to fail: `?broken=<prefix>`
 * in its address, or the `mav-broken` cookie, which a worker's requests
 * carry too (their referer is the worker, not the page).
 */
function isBroken(
  referer: string | undefined,
  cookie: string | undefined,
  path: string,
): boolean {
  const fromCookie = (cookie ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === BROKEN_COOKIE)?.[1];
  if (fromCookie && path.startsWith(decoded(fromCookie))) return true;
  if (!referer || !URL.canParse(referer)) return false;
  const params = new URL(referer).searchParams;
  if (params.get("gate") === "broken" && path.endsWith("voice-gate.js"))
    return true;
  const prefix = params.get("broken");
  return prefix !== null && prefix !== "" && path.startsWith(prefix);
}

/**
 * Serves `/modules/<id>/<path>` as Foundry would from the built module: the
 * package's copied assets and its `public/`.
 */
function moduleFiles(dirs: ReadonlyMap<string, ModuleFiles>): Plugin {
  return {
    name: "modular-av:module-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/modules\/([\w-]+)\/([\w./-]+)$/.exec(
          req.url?.split("?")[0] ?? "",
        );
        const files = match?.[1] ? dirs.get(match[1]) : undefined;
        // A page opened with ?gate=broken can't load the voice gate (the
        // core shows "open mic" in voice activity mode); with
        // ?broken=<path> none of the files under that path loads.
        if (
          match?.[2] &&
          isBroken(req.headers.referer, req.headers.cookie, match[2])
        ) {
          res.statusCode = 404;
          res.end();
          return;
        }
        // A worker runs from source: a module that imports it through Vite.
        const worker = match?.[2] ? files?.workers.get(match[2]) : undefined;
        if (worker) {
          res.setHeader("Content-Type", "text/javascript");
          res.end(`import ${JSON.stringify(`/@fs${worker}`)};\n`);
          return;
        }
        const file = match?.[2] ? fileOf(files, match[2]) : null;
        if (!file) {
          next();
          return;
        }
        // Downloads are cached by hash, without an extension.
        const extension = match?.[2]?.split(".").pop() ?? "";
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[extension] ?? "application/octet-stream",
        );
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  server: {
    // The browser tier reaches it at [::1] (see playwright.config.ts).
    host: "::1",
    port: HARNESS_PORT,
    strictPort: true,
    fs: { allow: [join(import.meta.dirname, "..", "..", "..", "..")] },
  },
  build: { target: "es2023" },
  plugins: [moduleFiles(await moduleDirs()), signalRelay()],
});
