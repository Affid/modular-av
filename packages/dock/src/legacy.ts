import { type DockMode, SETTINGS, type TileLayout } from "./settings.ts";

/**
 * LiveKit AVClient (`avclient-livekit`), the module this one replaces, kept
 * a player's dock in their browser: Foundry's `localStorage`,
 * `avclient-livekit.<key>` → JSON. Brought over once, only if saved.
 */
const LEGACY_PREFIX = "avclient-livekit.";

function readLegacyClient(
  storage: Pick<Storage, "getItem">,
  key: string,
): unknown {
  const raw = storage.getItem(`${LEGACY_PREFIX}${key}`);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Not what Foundry stored.
    return undefined;
  }
}

export interface LegacyDock {
  readonly tileLayout?: TileLayout;
  readonly mode?: DockMode;
}

/** The old layout (its compact one is grid here) and whether it floated. */
export function legacyDock(storage: Pick<Storage, "getItem">): LegacyDock {
  const layout = readLegacyClient(storage, "dockLayout");
  const floating = readLegacyClient(storage, "dockFloating");
  const tileLayout: TileLayout | undefined =
    layout === "focus"
      ? "focus"
      : layout === "grid" || layout === "compact"
        ? "grid"
        : undefined;
  const isFloating =
    typeof floating === "object" && floating !== null
      ? (floating as { floating?: unknown }).floating
      : undefined;
  const mode: DockMode | undefined =
    typeof isFloating === "boolean"
      ? isFloating
        ? "floating"
        : "docked"
      : undefined;
  return {
    ...(tileLayout ? { tileLayout } : {}),
    ...(mode ? { mode } : {}),
  };
}

export interface LegacyDeps {
  readonly storage: Pick<Storage, "getItem">;
  readonly imported: () => boolean;
  readonly markImported: (value: boolean) => Promise<void>;
  /** Saves one of the dock's settings, by its key. */
  readonly set: (key: string, value: unknown) => Promise<void>;
}

export async function importLegacy(deps: LegacyDeps): Promise<void> {
  if (deps.imported()) return;
  const dock = legacyDock(deps.storage);
  if (dock.tileLayout) await deps.set(SETTINGS.tileLayout, dock.tileLayout);
  if (dock.mode) await deps.set(SETTINGS.mode, dock.mode);
  await deps.markImported(true);
}
