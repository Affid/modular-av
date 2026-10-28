import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Catalog,
  CATALOG_SCHEMA,
  parseCatalog,
  type Requirement,
} from "../../packages/core/src/catalog/catalog.ts";
import { listModulePackages, ROOT } from "../workspace.ts";
import { releaseHold } from "./hold.ts";
import { distManifest, releaseUrls } from "./manifest.ts";

type Json = Readonly<Record<string, unknown>>;

const CORE_ID = "modular-av";

const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const field = (value: unknown, key: string): unknown =>
  isJson(value) ? value[key] : undefined;

/** What it requires of the family, at the lowest version that will do. */
function requirements(manifest: Json): Requirement[] {
  const requires = field(manifest.relationships, "requires");
  return (Array.isArray(requires) ? requires : [])
    .filter((r) => {
      const id = field(r, "id");
      return (
        typeof id === "string" &&
        (id === CORE_ID || id.startsWith(`${CORE_ID}-`))
      );
    })
    .map((r) => {
      const minimum = field(field(r, "compatibility"), "minimum");
      return {
        id: field(r, "id") as string,
        minimum: typeof minimum === "string" ? minimum : null,
      };
    });
}

/** A catalog entry from a built `module.json` (with URLs when released). */
function entry(manifest: Json, isReleased: boolean): Json {
  const { id, title, description, version } = manifest;
  const flags = field(manifest.flags, "modular-av");
  const kind = id === CORE_ID ? "core" : field(flags, "kind");
  const facts = field(flags, "facts");
  const icon = field(flags, "icon");
  const base = {
    id,
    title,
    description,
    kind,
    requires: requirements(manifest),
    ...(facts === undefined ? {} : { facts }),
    ...(icon === undefined ? {} : { icon }),
  };
  return isReleased ? { ...base, version, manifest: manifest.manifest } : base;
}

const byId = (a: Json, b: Json): number =>
  String(a.id).localeCompare(String(b.id));

/**
 * The family's catalog: released modules with their stable manifests,
 * held ones as coming soon. Checked with the core's own reader, so a
 * catalog it couldn't read is never published.
 */
export function buildCatalog(
  released: readonly Json[],
  held: readonly Json[],
): Catalog {
  const draft = {
    schema: CATALOG_SCHEMA,
    modules: released.map((m) => entry(m, true)).sort(byId),
    soon: held.map((m) => entry(m, false)).sort(byId),
  };
  const catalog = parseCatalog(draft);
  if (!catalog) {
    const ids = [...draft.modules, ...draft.soon].map((m) => String(m.id));
    throw new Error(
      `The catalog doesn't pass the core's checks; look at: ${ids.join(", ")}`,
    );
  }
  const dropped = cardsDropped(draft, catalog);
  if (dropped.length > 0)
    throw new Error(
      `The core would drop the card facts or icon of: ${dropped.join(", ")}`,
    );
  return catalog;
}

/** Modules whose facts or icon the core's reader left out. */
function cardsDropped(
  draft: { readonly modules: readonly Json[]; readonly soon: readonly Json[] },
  catalog: Catalog,
): readonly string[] {
  const read = [...catalog.modules, ...catalog.soon];
  return [...draft.modules, ...draft.soon]
    .filter((m) => {
      const kept = read.find((r) => r.id === m.id);
      return (
        (m.facts !== undefined && kept?.facts === undefined) ||
        (m.icon !== undefined && kept?.icon === undefined)
      );
    })
    .map((m) => String(m.id));
}

interface WorkspaceManifest {
  readonly manifest: Json;
  readonly held: boolean;
}

/** Every module's release `module.json`, as this workspace would release it. */
async function workspaceManifests(
  root: string,
): Promise<readonly WorkspaceManifest[]> {
  const modules = await listModulePackages(root);
  return Promise.all(
    modules.map(async (m) => {
      const source = JSON.parse(
        await readFile(join(m.dir, "module.json"), "utf8"),
      ) as Json;
      const held = (await releaseHold(m.dir)) !== null;
      const urls = held ? undefined : releaseUrls(m.id, m.version);
      return { manifest: distManifest(source, m.version, urls), held };
    }),
  );
}

const heldOnes = (read: readonly WorkspaceManifest[]): Json[] =>
  read.filter((r) => r.held).map((r) => r.manifest);

/**
 * The catalog of this workspace's release, as the release publishes it:
 * the core ships this copy, for when GitHub can't be reached.
 */
export async function workspaceCatalog(root = ROOT): Promise<Catalog> {
  const read = await workspaceManifests(root);
  return buildCatalog(
    read.filter((r) => !r.held).map((r) => r.manifest),
    heldOnes(read),
  );
}

/**
 * The catalog for the manifests branch: what is published there (each
 * `<id>/module.json`), and the modules this workspace holds back.
 */
export async function publishedCatalog(
  branchDir: string,
  root = ROOT,
): Promise<Catalog> {
  const entries = await readdir(branchDir, { withFileTypes: true });
  const published = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith(CORE_ID))
      .map(
        async (e) =>
          JSON.parse(
            await readFile(join(branchDir, e.name, "module.json"), "utf8"),
          ) as Json,
      ),
  );
  return buildCatalog(published, heldOnes(await workspaceManifests(root)));
}
