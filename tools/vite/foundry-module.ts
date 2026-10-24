import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, UserConfig } from "vite";
import { readAssets } from "../assets/assets.ts";
import {
  disallowed,
  packageDirs,
  readPackage,
  renderNotices,
  withDependencies,
} from "../notices/notices.ts";
import { distManifest } from "../release/manifest.ts";
import { ROOT } from "../workspace.ts";

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

/**
 * Emits what Foundry needs next to the bundle: `module.json` with the
 * package version, the language files, the licence and the notices.
 */
function foundryFiles(packageDir: string, version: string): Plugin {
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

/** Copies the files listed in `modularAV.assets` from their packages. */
function packageAssets(packageDir: string): Plugin {
  return {
    name: "modular-av:package-assets",
    generateBundle() {
      for (const [fileName, file] of readAssets(packageDir))
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
        entry: join(packageDir, "src/index.ts"),
        formats: ["es"],
        fileName: () => `${id}.js`,
        // A UI module's styles, listed in its module.json.
        cssFileName: id,
      },
    },
    plugins: [foundryFiles(packageDir, version), packageAssets(packageDir)],
  };
}
