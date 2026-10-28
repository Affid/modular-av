import type { InputSensitivity } from "@modular-av/api";

/**
 * LiveKit AVClient (`avclient-livekit`), the module this one replaces, kept
 * each player's choices in their browser as client settings: Foundry's
 * `localStorage`, `<module>.<key>` → JSON. Each Modular A/V module brings
 * over its own, once, and only what the player saved.
 */
export const LEGACY_PREFIX = "avclient-livekit.";

/** An old client setting as the player saved it; undefined if never saved. */
export function readLegacyClient(
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

export interface LegacyDeps {
  readonly storage: Pick<Storage, "getItem">;
  readonly imported: () => boolean;
  readonly markImported: (value: boolean) => Promise<void>;
  readonly setInputSensitivity: (s: Partial<InputSensitivity>) => Promise<void>;
}

/** The old voice gate's choices: the same gate, the same dBFS. */
function sensitivityOf(
  storage: Pick<Storage, "getItem">,
): Partial<InputSensitivity> {
  const auto = readLegacyClient(storage, "audioAutoSensitivity");
  const threshold = readLegacyClient(storage, "audioNoiseGateThreshold");
  const validThreshold =
    typeof threshold === "number" && threshold >= -100 && threshold <= 0;
  return {
    ...(typeof auto === "boolean" ? { auto } : {}),
    ...(validThreshold ? { threshold } : {}),
  };
}

/** Brings the old input sensitivity over, once per browser. */
export async function importLegacy(deps: LegacyDeps): Promise<void> {
  if (deps.imported()) return;
  const sensitivity = sensitivityOf(deps.storage);
  if (Object.keys(sensitivity).length > 0)
    await deps.setInputSensitivity(sensitivity);
  await deps.markImported(true);
}
