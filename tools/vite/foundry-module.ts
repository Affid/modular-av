import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, UserConfig } from "vite";
import { readAssets } from "../assets/assets.ts";
import { fetchDownloads } from "../assets/downloads.ts";
import { readWorkers } from "../assets/workers.ts";
import {
  disallowed,
  packageDirs,
  readPackage,
  renderNotices,
  withDependencies,
} from "../notices/notices.ts";
import { workspaceCatalog } from "../release/catalog.ts";
import { distManifest } from "../release/manifest.ts";
import { ROOT } from "../workspace.ts";

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

/** A `modularAV` option from a package.json. */
const field = (pkg: Record<string, unknown>, key: string): unknown => {
  const options = pkg.modularAV;
  return typeof options === "object" && options !== null
    ? (options as Record<string, unknown>)[key]
    : undefined;
};

/**
 * Emits what Foundry needs next to the bundle: `module.json` with the
 * package version, the language files, the licence and the notices; and
 * for the core (`modularAV.catalog`), the catalog of this release.
 */
function foundryFiles(
  packageDir: string,
  version: string,
  withCatalog: boolean,
): Plugin {
  return {
    name: "modular-av:foundry-files",
    async generateBundle(_options, bundle) {
      const source = readJson(join(packageDir, "module.json"));
      const emit = (fileName: string, text: string): void => {
        this.emitFile({ type: "asset", fileName, source: text });
      };
      emit(
        "module.json",
        `${JSON.stringify(distManifest(source, version), null, 2)}\n`,
      );
      for (const name of readdirSync(join(packageDir, "lang"))) {
        emit(
          `lang/${name}`,
          readFileSync(join(packageDir, "lang", name), "utf8"),
        );
      }
      emit("LICENSE", readFileSync(join(ROOT, "LICENSE"), "utf8"));
      if (withCatalog)
        emit(
          "catalog.json",
          `${JSON.stringify(await workspaceCatalog(), null, 2)}\n`,
        );
      const moduleIds = Object.values(bundle).flatMap((output) =>
        output.type === "chunk" ? Object.keys(output.modules) : [],
      );
      const dirs = await withDependencies(packageDirs(moduleIds));
      const bundled = (await Promise.all(dirs.map(readPackage))).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const refused = disallowed(bundled);
      if (refused.length > 0)
        this.error(
          `bundles code under licences no module may ship (handoff §2): ${refused
            .map((p) => `${p.name} (${p.license})`)
            .join(", ")}`,
        );
      const header = readFileSync(
        join(packageDir, "THIRD-PARTY-NOTICES.md"),
        "utf8",
      );
      emit("THIRD-PARTY-NOTICES.md", renderNotices(header, bundled));
    },
  };
}

/**
 * Copies the files listed in `modularAV.assets` from their packages, and
 * those in `modularAV.downloads` from the download cache (fetched first).
 */
function packageAssets(packageDir: string): Plugin {
  let downloads: ReadonlyMap<string, string> = new Map();
  return {
    name: "modular-av:package-assets",
    async buildStart() {
      downloads = await fetchDownloads(packageDir);
    },
    generateBundle() {
      for (const [fileName, file] of [...readAssets(packageDir), ...downloads])
        this.emitFile({ type: "asset", fileName, source: readFileSync(file) });
    },
  };
}

/** Vite config for a package that builds into a Foundry module in `dist/`. */
export function foundryModuleConfig(packageDir: string): UserConfig {
  const manifest = readJson(join(packageDir, "module.json"));
  const pkg = readJson(join(packageDir, "package.json"));
  const id = manifest.id;
  const version = pkg.version;
  if (typeof id !== "string" || typeof version !== "string") {
    throw new Error(
      `${packageDir}: module.json needs an id and package.json a version`,
    );
  }
  return {
    root: packageDir,
    // Files Foundry serves as they are (worklets, models) go in `public/`,
    // copied to `dist/` and resolved at run time with `api.assetUrl`.
    publicDir: join(packageDir, "public"),
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
      target: "es2023",
      // Readable bundles: Foundry hook names come from constructor names.
      minify: false,
      // Doc comments stay in the source maps' sources; licences and
      // bundler annotations stay in the code.
      rolldownOptions: {
        output: { comments: { legal: true, annotation: true, jsdoc: false } },
      },
      lib: {
        // The module's entry, and its workers (`modularAV.workers`) as
        // entries of their own, fetched by the browser only when started.
        entry: {
          [id]: join(packageDir, "src/index.ts"),
          ...Object.fromEntries(
            readWorkers(packageDir).map((w) => [w.name, w.source]),
          ),
        },
        formats: ["es"],
        fileName: (_format, entryName) => `${entryName}.js`,
        // A UI module's styles, listed in its module.json.
        cssFileName: id,
      },
    },
    plugins: [
      foundryFiles(packageDir, version, field(pkg, "catalog") === true),
      packageAssets(packageDir),
    ],
  };
}
