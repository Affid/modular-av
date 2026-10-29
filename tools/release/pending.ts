import { tagFor } from "./manifest.ts";

export interface Releasable {
  readonly id: string;
  readonly version: string;
  /** The family modules it requires, by id. */
  readonly requires: readonly string[];
}

/**
 * The modules whose current version has no tag yet, in an order to
 * publish them: each after the modules it requires that are published in
 * the same release, so no published manifest requires an unpublished
 * version.
 */
export function pendingReleases<M extends Releasable>(
  modules: readonly M[],
  tags: ReadonlySet<string>,
): readonly M[] {
  const pending = modules.filter((m) => !tags.has(tagFor(m.id, m.version)));
  const ids = new Set(pending.map((m) => m.id));
  let ordered: readonly M[] = [];
  let left = [...pending].sort((a, b) => a.id.localeCompare(b.id));
  while (left.length > 0) {
    const placed = new Set(ordered.map((m) => m.id));
    const ready = left.filter((m) =>
      m.requires.every((r) => !ids.has(r) || placed.has(r)),
    );
    if (ready.length === 0)
      throw new Error(
        `Requirements go round in a circle: ${left.map((m) => m.id).join(", ")}`,
      );
    ordered = [...ordered, ...ready];
    left = left.filter((m) => !ready.includes(m));
  }
  return ordered;
}
