// Development builds (docs/RELEASING.md): one rolling GitHub prerelease,
// tag `dev`, installed in Foundry by its own manifest URLs. It never
// reaches the manifests branch, the catalog or foundryvtt.com.
import { REPOSITORY } from "./manifest.ts";

export const DEV_TAG = "dev";

const ID = /^modular-av(?:-[a-z0-9]+)*$/;
const RELATION_KINDS = ["requires", "recommends"] as const;

type Json = Readonly<Record<string, unknown>>;

const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface DevModule {
  readonly id: string;
  readonly version: string;
}

function devAssetUrl(id: string, extension: "json" | "zip"): string {
  if (!ID.test(id)) throw new Error(`"${id}" is not a Modular A/V module id`);
  return `https://github.com/${REPOSITORY}/releases/download/${DEV_TAG}/${id}.${extension}`;
}

/** A module's manifest in the dev release; the same URL for every dev build. */
export function devManifestUrl(id: string): string {
  return devAssetUrl(id, "json");
}

/**
 * The version of a dev build, stamped with the UTC time. Foundry's
 * `isNewerVersion` counts `0.12.0-dev.<stamp>` newer than 0.12.0 and every
 * earlier dev build, and older than 0.12.1 or 0.13.0, so the next release
 * replaces it.
 */
export function devVersion(version: string, at: Date): string {
  const stamp = at.toISOString().replace(/\D/g, "").slice(0, 14);
  return `${version}${version.includes("-") ? "." : "-"}dev.${stamp}`;
}

function devRelationships(
  relationships: Json,
  family: ReadonlySet<string>,
): Json {
  const toDev = (entry: unknown): unknown =>
    isJson(entry) && typeof entry.id === "string" && family.has(entry.id)
      ? { ...entry, manifest: devManifestUrl(entry.id) }
      : entry;
  const rewritten = RELATION_KINDS.filter((kind) =>
    Array.isArray(relationships[kind]),
  ).map((kind): [string, unknown[]] => [
    kind,
    (relationships[kind] as unknown[]).map(toDev),
  ]);
  return { ...relationships, ...Object.fromEntries(rewritten) };
}

/**
 * A built `module.json` as a dev build: its version, the dev release's URLs,
 * "(dev)" in the title, and family modules in the same build (`family`)
 * installed from the dev release too.
 */
export function devManifest(
  built: Json,
  version: string,
  family: ReadonlySet<string>,
): Record<string, unknown> {
  const id = built.id;
  if (typeof id !== "string") throw new Error("The manifest has no module id");
  const relationships = isJson(built.relationships)
    ? { relationships: devRelationships(built.relationships, family) }
    : {};
  return {
    ...built,
    ...relationships,
    title: `${typeof built.title === "string" ? built.title : id} (dev)`,
    version,
    manifest: devManifestUrl(id),
    download: devAssetUrl(id, "zip"),
  };
}

/** The wanted modules and every family module they require, however deep. */
export function devModules(
  wanted: readonly string[],
  requires: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  const found = new Set<string>();
  const visit = (id: string): void => {
    if (found.has(id)) return;
    const needs = requires.get(id);
    if (!needs) throw new Error(`No module "${id}" in packages/`);
    found.add(id);
    needs.forEach(visit);
  };
  wanted.forEach(visit);
  return found;
}

/** The dev release's description: what it was built from, and how to install it. */
export function devNotes(
  branch: string,
  commit: string,
  modules: readonly DevModule[],
): string {
  const lines = modules.map(
    (m) => `- ${m.id} ${m.version}: ${devManifestUrl(m.id)}`,
  );
  return [
    `Development build of \`${branch}\` at ${commit}, for testing only.`,
    "The next development build replaces it without notice. To play, install",
    "Modular A/V from Foundry's package list or the manifest URLs in the README.",
    "",
    "Install in Foundry (Add-on Modules, Install Module, Manifest URL):",
    "",
    ...lines,
  ].join("\n");
}
