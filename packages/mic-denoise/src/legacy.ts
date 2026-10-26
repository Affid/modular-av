import { type ModelId, MODELS } from "./models.ts";

/**
 * LiveKit AVClient (`avclient-livekit`), the module this one replaces, kept
 * a player's noise cancellation in their browser: Foundry's `localStorage`,
 * `avclient-livekit.<key>` → JSON. Brought over once, only if saved.
 */
const LEGACY_PREFIX = "avclient-livekit.";
/** The old default model, used when "enhanced" was on and no model chosen. */
const OLD_DEFAULT: ModelId = "gtcrn";

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

/** The model the player had on, or null (off, never chosen, or Krisp). */
export function legacyModel(storage: Pick<Storage, "getItem">): ModelId | null {
  const enhanced = readLegacyClient(storage, "enhancedNoiseCancellation");
  const model = readLegacyClient(storage, "noiseSuppressionModel");
  if (enhanced === false) return null;
  if (enhanced === undefined && model === undefined) return null;
  const id = typeof model === "string" ? model : OLD_DEFAULT;
  return MODELS.find((m) => m.id === id)?.id ?? null;
}

export interface LegacyDeps {
  readonly storage: Pick<Storage, "getItem">;
  readonly imported: () => boolean;
  readonly markImported: (value: boolean) => Promise<void>;
  readonly turnOn: (model: ModelId) => Promise<void>;
}

export async function importLegacy(deps: LegacyDeps): Promise<void> {
  if (deps.imported()) return;
  const model = legacyModel(deps.storage);
  if (model) await deps.turnOn(model);
  await deps.markImported(true);
}
