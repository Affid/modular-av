import type { ModuleKind } from "@modular-av/api";

/**
 * Where every released module's manifest lives (docs/RELEASING.md); a
 * catalog may point nowhere else.
 */
export const MANIFESTS_URL =
  "https://raw.githubusercontent.com/Affid/modular-av/manifests/";

export const CATALOG_SCHEMA = 1;

/** The core is a kind of its own: everything else plugs into it. */
export type CatalogKind = "core" | ModuleKind;

export interface Requirement {
  readonly id: string;
  /** The lowest version that will do, or null for any. */
  readonly minimum: string | null;
}

/** A module not released yet (held back), listed as coming soon. */
export interface SoonModule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: CatalogKind;
  readonly requires: readonly Requirement[];
}

/** A released module: its latest version and where Foundry installs it. */
export interface CatalogModule extends SoonModule {
  readonly version: string;
  readonly manifest: string;
}

export interface Catalog {
  readonly schema: typeof CATALOG_SCHEMA;
  readonly modules: readonly CatalogModule[];
  readonly soon: readonly SoonModule[];
}

const ID = /^modular-av(?:-[a-z0-9]+){0,4}$/;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/;
const KINDS: ReadonlySet<unknown> = new Set([
  "core",
  "service",
  "effect",
  "ui",
  "theme",
]);
const LIMITS = { title: 120, description: 500, requires: 10, modules: 100 };

type Fields = Readonly<Record<string, unknown>>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

function requirement(value: unknown): Requirement | null {
  if (!isFields(value) || typeof value.id !== "string" || !ID.test(value.id))
    return null;
  if (value.minimum === undefined) return { id: value.id, minimum: null };
  return typeof value.minimum === "string" && SEMVER.test(value.minimum)
    ? { id: value.id, minimum: value.minimum }
    : null;
}

function soonModule(value: unknown): SoonModule | null {
  if (!isFields(value)) return null;
  const { id, title, description, kind, requires } = value;
  if (typeof id !== "string" || !ID.test(id) || !KINDS.has(kind)) return null;
  if (!text(title, LIMITS.title) || !text(description, LIMITS.description))
    return null;
  if (!Array.isArray(requires) || requires.length > LIMITS.requires)
    return null;
  const needs = requires.map(requirement);
  if (needs.some((n) => n === null)) return null;
  return {
    id,
    title,
    description,
    kind: kind as CatalogKind,
    requires: needs as Requirement[],
  };
}

function releasedModule(value: unknown): CatalogModule | null {
  const base = soonModule(value);
  if (!base || !isFields(value)) return null;
  const { version, manifest } = value;
  if (typeof version !== "string" || !SEMVER.test(version)) return null;
  // Exactly its own manifest on the manifests branch, nothing else.
  if (manifest !== `${MANIFESTS_URL}${base.id}/module.json`) return null;
  return { ...base, version, manifest };
}

function list<T extends SoonModule>(
  value: unknown,
  read: (entry: unknown) => T | null,
): readonly T[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.modules) return null;
  const entries = value.map(read);
  if (entries.some((e) => e === null)) return null;
  const checked = entries as T[];
  const ids = new Set(checked.map((e) => e.id));
  return ids.size === checked.length ? checked : null;
}

/**
 * A catalog from untrusted JSON (fetched from GitHub, or the copy that
 * came with the core): every field checked, unknown ones dropped, the
 * whole catalog refused if anything is off. Shown as text only.
 */
export function parseCatalog(value: unknown): Catalog | null {
  if (!isFields(value) || value.schema !== CATALOG_SCHEMA) return null;
  const modules = list(value.modules, releasedModule);
  const soon = list(value.soon ?? [], soonModule);
  return modules && soon ? { schema: CATALOG_SCHEMA, modules, soon } : null;
}
