import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { readAssets } from "../../../../tools/assets/assets.ts";
import { signalRelay } from "./signal-relay.ts";

export const HARNESS_PORT = 5174;

const PACKAGES = join(import.meta.dirname, "..", "..", "..");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  js: "text/javascript",
  wasm: "application/wasm",
  json: "application/json",
};

interface ModuleFiles {
  /** The package's `public/` directory, if it has one. */
  readonly pub: string | null;
  /** Files copied from npm packages at build time (`modularAV.assets`). */
  readonly assets: ReadonlyMap<string, string>;
}

/** Module id → what Foundry would serve from its directory. */
function moduleDirs(): ReadonlyMap<string, ModuleFiles> {
  const entries = readdirSync(PACKAGES).flatMap((dir) => {
    const manifest = join(PACKAGES, dir, "module.json");
    if (!existsSync(manifest)) return [];
    const pub = join(PACKAGES, dir, "public");
    const { id } = JSON.parse(readFileSync(manifest, "utf8")) as { id: string };
    const files: ModuleFiles = {
      pub: existsSync(pub) ? pub : null,
      assets: readAssets(join(PACKAGES, dir)),
    };
    return [[id, files] as const];
  });
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

/**
 * Serves `/modules/<id>/<path>` as Foundry would from the built module: the
 * package's copied assets and its `public/`.
 */
function moduleFiles(): Plugin {
  const dirs = moduleDirs();
  return {
    name: "modular-av:module-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/modules\/([\w-]+)\/([\w./-]+)$/.exec(
          req.url?.split("?")[0] ?? "",
        );
        const files = match?.[1] ? dirs.get(match[1]) : undefined;
        // A page opened with ?gate=broken can't load the voice gate: the
        // core shows "open mic" in voice activity mode.
        if (
          req.headers.referer?.includes("gate=broken") &&
          match?.[2]?.endsWith("voice-gate.js")
        ) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const file = match?.[2] ? fileOf(files, match[2]) : null;
        if (!file) {
          next();
          return;
        }
        const extension = file.split(".").pop() ?? "";
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
  plugins: [moduleFiles(), signalRelay()],
});
