import { REPOSITORY, tagFor } from "./manifest.ts";

/**
 * Foundry's package release API (https://foundryvtt.com/article/package-release-api/).
 * Since Foundry 14.366 a listed package's updates come from foundryvtt.com,
 * not from its manifest URL, so every release of a listed module is sent
 * there too.
 */
export const LISTING_API =
  "https://foundryvtt.com/_api/packages/release_version/";

export interface Compatibility {
  readonly minimum: string;
  readonly verified: string;
  readonly maximum?: string;
}

/** The body Foundry takes for one version of one package. */
export interface ListingRequest {
  readonly id: string;
  readonly "dry-run": boolean;
  readonly release: {
    readonly version: string;
    /** This version's own manifest (the GitHub release's), not the stable one. */
    readonly manifest: string;
    readonly notes: string;
    readonly compatibility: Compatibility;
  };
}

export type ListingOutcome =
  | { readonly kind: "saved"; readonly page: string }
  | { readonly kind: "checked"; readonly page: string }
  | { readonly kind: "exists" };

type Json = Readonly<Record<string, unknown>>;

const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(source: Json, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string" || value === "")
    throw new Error(`module.json has no ${where}`);
  return value;
}

function compatibilityOf(manifest: Json): Compatibility {
  const compatibility = isJson(manifest.compatibility)
    ? manifest.compatibility
    : {};
  const minimum = text(compatibility, "minimum", "compatibility.minimum");
  const verified = text(compatibility, "verified", "compatibility.verified");
  const { maximum } = compatibility;
  return typeof maximum === "string" && maximum !== ""
    ? { minimum, verified, maximum }
    : { minimum, verified };
}

/**
 * The request that lists a released version, from the `module.json` of
 * its GitHub release; `packagePath` is the package's directory in the
 * repository, for the changelog at the release's tag.
 */
export function listingRelease(
  manifest: unknown,
  packagePath: string,
  dryRun: boolean,
): ListingRequest {
  if (!isJson(manifest)) throw new Error("module.json is not an object");
  const id = text(manifest, "id", "id");
  const version = text(manifest, "version", "version");
  const tag = tagFor(id, version);
  return {
    id,
    "dry-run": dryRun,
    release: {
      version,
      manifest: `https://github.com/${REPOSITORY}/releases/download/${tag}/module.json`,
      notes: `https://github.com/${REPOSITORY}/blob/${tag}/${packagePath}/CHANGELOG.md`,
      compatibility: compatibilityOf(manifest),
    },
  };
}

/**
 * The variable that holds a package's release token (each package has its
 * own, on its page on foundryvtt.com), e.g. FOUNDRY_RELEASE_TOKEN_MODULAR_AV.
 */
export function listingTokenKey(id: string): string {
  return `FOUNDRY_RELEASE_TOKEN_${id.toUpperCase().replaceAll("-", "_")}`;
}

/** Foundry's field errors as "field: message" lines. */
function fieldErrors(errors: Json): readonly string[] {
  return Object.entries(errors).flatMap(([field, list]) =>
    (Array.isArray(list) ? list : []).map((entry: unknown) => {
      const message =
        isJson(entry) && typeof entry.message === "string"
          ? entry.message
          : "refused";
      return `${field}: ${message}`;
    }),
  );
}

const isDuplicate = (errors: Json): boolean =>
  Array.isArray(errors.__all__) &&
  errors.__all__.some(
    (entry: unknown) => isJson(entry) && entry.code === "unique_together",
  );

async function jsonBody(response: Response): Promise<Json> {
  try {
    const body: unknown = await response.json();
    return isJson(body) ? body : {};
  } catch {
    // Not JSON (an HTML error page): the status says enough.
    return {};
  }
}

/**
 * Sends one version to foundryvtt.com. A version Foundry already has
 * counts as done, so a publish that failed later can be re-run.
 */
export async function submitListing(
  request: ListingRequest,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<ListingOutcome> {
  const response = await fetchFn(LISTING_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(request),
  });
  const where = `foundryvtt.com (${request.id} ${request.release.version})`;
  if (response.status === 429) {
    const wait = response.headers.get("Retry-After") ?? "60";
    throw new Error(`${where} limits the rate: try again in ${wait} seconds`);
  }
  const body = await jsonBody(response);
  if (response.ok && typeof body.page === "string")
    return { kind: request["dry-run"] ? "checked" : "saved", page: body.page };
  const errors = isJson(body.errors) ? body.errors : {};
  if (response.status === 400 && isDuplicate(errors)) return { kind: "exists" };
  const details = fieldErrors(errors);
  throw new Error(
    `${where} answered ${String(response.status)}${details.length > 0 ? `:\n  ${details.join("\n  ")}` : ""}`,
  );
}
