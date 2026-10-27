import type { LoadedCatalog } from "../modules/host.ts";
import { type Catalog, CATALOG_URL, parseCatalog } from "./catalog.ts";

/** A slow GitHub must not hold the window: the core's own catalog instead. */
const TIMEOUT_MS = 5000;

/** Far above the family's catalog (a few kilobytes); anything bigger isn't it. */
export const MAX_CATALOG_BYTES = 256 * 1024;

/** `fetch`, narrowed to what reading the catalog needs. */
export type CatalogFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ readonly ok: boolean; text(): Promise<string> }>;

/**
 * The catalog on the manifests branch, or null for any failure. The GM's
 * browser asks GitHub as Foundry's own manifest checks do: no cookies, no
 * referrer, a short timeout; the answer is checked like untrusted input.
 */
export async function fetchCatalog(
  fetch: CatalogFetch,
): Promise<Catalog | null> {
  try {
    const response = await fetch(CATALOG_URL, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-cache",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > MAX_CATALOG_BYTES) return null;
    return parseCatalog(JSON.parse(text));
  } catch {
    // Offline, blocked, timed out or not JSON: the bundled catalog serves.
    return null;
  }
}

export interface CatalogSources {
  /** The catalog that came with this core. */
  bundled(): Promise<Catalog>;
  /** GitHub's, or null when it can't be had. */
  remote(): Promise<Catalog | null>;
  /** The world setting: a GM may turn checking GitHub off. */
  readonly checkGitHub: boolean;
}

/** GitHub's catalog when allowed and reachable, else the core's own. */
export async function loadCatalogs(
  sources: CatalogSources,
): Promise<LoadedCatalog> {
  const bundled = await sources.bundled();
  const known = new Set(bundled.modules.map((m) => m.id));
  if (!sources.checkGitHub) return { catalog: bundled, source: "off", known };
  const remote = await sources.remote();
  return remote
    ? { catalog: remote, source: "github", known }
    : { catalog: bundled, source: "offline", known };
}
