/** Where releases live; see docs/RELEASING.md. */
export const REPOSITORY = "Affid/modular-av";
export const MANIFESTS_BRANCH = "manifests";

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;
const MODULE_ID = String.raw`modular-av(?:-[a-z0-9]+)*`;
const TAG = new RegExp(`^(${MODULE_ID})-v(${SEMVER})$`);
const VERSION = new RegExp(`^${SEMVER}$`);

/** Fields the build writes; a source `module.json` must not set them. */
const GENERATED_FIELDS = ["version", "manifest", "download"] as const;

export interface ReleaseUrls {
  readonly manifest: string;
  readonly download: string;
}

export function tagFor(id: string, version: string): string {
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

export function releaseUrls(id: string, version: string): ReleaseUrls {
  return {
    manifest: `https://raw.githubusercontent.com/${REPOSITORY}/${MANIFESTS_BRANCH}/${id}/module.json`,
    download: `https://github.com/${REPOSITORY}/releases/download/${tagFor(id, version)}/${id}.zip`,
  };
}

/** The `module.json` that goes into `dist/`: the source plus generated fields. */
export function distManifest(
  source: Readonly<Record<string, unknown>>,
  version: string,
  urls?: ReleaseUrls,
): Record<string, unknown> {
  for (const field of GENERATED_FIELDS) {
    if (field in source)
      throw new Error(`"${field}" is generated: remove it from module.json`);
  }
  return { ...source, version, ...urls };
}
