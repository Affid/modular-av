import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { signalRelay } from "./signal-relay.ts";

export const HARNESS_PORT = 5174;

const PACKAGES = join(import.meta.dirname, "..", "..", "..");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  js: "text/javascript",
  wasm: "application/wasm",
  json: "application/json",
};

/** Module id → the package's `public/` directory, for packages that have one. */
function publicDirs(): ReadonlyMap<string, string> {
  const entries = readdirSync(PACKAGES).flatMap((dir) => {
    const manifest = join(PACKAGES, dir, "module.json");
    const pub = join(PACKAGES, dir, "public");
    if (!existsSync(manifest) || !existsSync(pub)) return [];
    const { id } = JSON.parse(readFileSync(manifest, "utf8")) as { id: string };
    return [[id, pub] as const];
  });
  return new Map(entries);
}

/** Serves `/modules/<id>/<path>` from the package's `public/`, as Foundry would. */
function moduleFiles(): Plugin {
  const dirs = publicDirs();
  return {
    name: "modular-av:module-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/modules\/([\w-]+)\/([\w./-]+)$/.exec(
          req.url?.split("?")[0] ?? "",
        );
        const dir = match?.[1] ? dirs.get(match[1]) : undefined;
        const file = dir && match?.[2] ? normalize(join(dir, match[2])) : null;
        if (!dir || !file?.startsWith(dir + sep) || !existsSync(file)) {
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
