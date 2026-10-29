/** Where releases live; see docs/RELEASING.md. */
export const REPOSITORY = "Affid/modular-av";
export const MANIFESTS_BRANCH = "manifests";

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;
const MODULE_ID = String.raw`modular-av(?:-[a-z0-9]+)*`;
const TAG = new RegExp(`^(${MODULE_ID})-v(${SEMVER})$`);
const VERSION = new RegExp(`^${SEMVER}$`);
const ID = new RegExp(`^${MODULE_ID}$`);

/** Fields the build writes; a source `module.json` must not set them. */
const GENERATED_FIELDS = ["version", "manifest", "download"] as const;

export interface ReleaseUrls {
  readonly manifest: string;
  readonly download: string;
}

export function tagFor(id: string, version: string): string {
  if (!ID.test(id)) throw new Error(`"${id}" is not a Modular A/V module id`);
  if (!VERSION.test(version))
    throw new Error(`"${version}" is not a semver version`);
  return `${id}-v${version}`;
}

export function parseTag(
  tag: string,
): { id: string; version: string } | undefined {
  const match = TAG.exec(tag);
  return match?.[1] && match[2]
    ? { id: match[1], version: match[2] }
    : undefined;
}

/** A module's stable manifest URL, the same for every version. */
export function manifestUrl(id: string): string {
  if (!ID.test(id)) throw new Error(`"${id}" is not a Modular A/V module id`);
  return `https://raw.githubusercontent.com/${REPOSITORY}/${MANIFESTS_BRANCH}/${id}/module.json`;
}

export function releaseUrls(id: string, version: string): ReleaseUrls {
  return {
    manifest: manifestUrl(id),
    download: `https://github.com/${REPOSITORY}/releases/download/${tagFor(id, version)}/${id}.zip`,
  };
}

type Json = Readonly<Record<string, unknown>>;

const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const RELATION_KINDS = ["requires", "recommends"] as const;

/** Each family module's version in this workspace, by module id. */
export type FamilyVersions = Readonly<Record<string, string>>;

/**
 * A family module in a relationship gets its stable manifest URL, so
 * Foundry can install it (nothing is on Foundry's package list); one it
 * requires is required at the version in the workspace, the one this
 * release is built and tested with, whatever its own version.
 */
function familyEntry(
  kind: (typeof RELATION_KINDS)[number],
  entry: unknown,
  family: FamilyVersions,
): unknown {
  if (!isJson(entry) || typeof entry.id !== "string" || !ID.test(entry.id))
    return entry;
  for (const field of ["manifest", "compatibility"] as const)
    if (field in entry)
      throw new Error(
        field === "manifest"
          ? `the manifest of "${entry.id}" is generated: remove it from module.json`
          : `compatibility with "${entry.id}" is generated: remove it from module.json`,
      );
  const manifest = manifestUrl(entry.id);
  if (kind !== "requires") return { ...entry, manifest };
  const minimum = family[entry.id];
  if (minimum === undefined)
    throw new Error(`"${entry.id}" isn't in this workspace`);
  return { ...entry, manifest, compatibility: { minimum } };
}

function familyRelationships(source: Json, family: FamilyVersions): Json {
  const relationships = source.relationships;
  if (!isJson(relationships)) return source;
  const generated = Object.fromEntries(
    RELATION_KINDS.filter((kind) => Array.isArray(relationships[kind])).map(
      (kind) => [
        kind,
        (relationships[kind] as unknown[]).map((entry) =>
          familyEntry(kind, entry, family),
        ),
      ],
    ),
  );
  return { ...source, relationships: { ...relationships, ...generated } };
}

/** The `module.json` that goes into `dist/`: the source plus generated fields. */
export function distManifest(
  source: Json,
  version: string,
  family: FamilyVersions,
  urls?: ReleaseUrls,
): Record<string, unknown> {
  for (const field of GENERATED_FIELDS) {
    if (field in source)
      throw new Error(`"${field}" is generated: remove it from module.json`);
  }
  return { ...familyRelationships(source, family), version, ...urls };
}
