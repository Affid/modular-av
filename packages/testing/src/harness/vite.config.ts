import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { readAssets } from "../../../../tools/assets/assets.ts";
import { fetchDownloads } from "../../../../tools/assets/downloads.ts";
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

/** Whether the page asked for this module file to fail. */
function isBroken(referer: string | undefined, path: string): boolean {
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
        if (match?.[2] && isBroken(req.headers.referer, match[2])) {
          res.statusCode = 404;
          res.end();
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
