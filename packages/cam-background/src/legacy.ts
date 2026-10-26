import type { CameraBackgroundSettings, Quality } from "./settings.ts";

/**
 * LiveKit AVClient (`avclient-livekit`), the module this one replaces, kept
 * a player's camera background in their browser: Foundry's `localStorage`,
 * `avclient-livekit.<key>` → JSON. Brought over once, only if saved; a
 * lazy chunk, loaded only when one of those keys is there.
 */
export const LEGACY_KEYS = [
  "videoBackground",
  "videoBlurStrength",
  "videoBackgroundQuality",
  "videoBackgroundImage",
  "videoBackgroundCustomImage",
] as const;

function readLegacyClient(
  storage: Pick<Storage, "getItem">,
  key: string,
): unknown {
  const raw = storage.getItem(`avclient-livekit.${key}`);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Not what Foundry stored.
    return undefined;
  }
}

export interface LegacyBackground {
  readonly effect?: "background-blur" | "background-replace";
  readonly strength?: number;
  readonly quality?: Quality;
  readonly image?: string;
  readonly customImage?: string;
}

const EFFECTS: Readonly<Record<string, LegacyBackground["effect"]>> = {
  blur: "background-blur",
  image: "background-replace",
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function legacyBackground(
  storage: Pick<Storage, "getItem">,
): LegacyBackground {
  const read = (key: (typeof LEGACY_KEYS)[number]): unknown =>
    readLegacyClient(storage, key);
  const mode = read("videoBackground");
  const effect = typeof mode === "string" ? EFFECTS[mode] : undefined;
  const strength = read("videoBlurStrength");
  const quality = read("videoBackgroundQuality");
  const image = text(read("videoBackgroundImage"));
  const customImage = text(read("videoBackgroundCustomImage"));
  return {
    ...(effect ? { effect } : {}),
    ...(typeof strength === "number" && strength >= 0.1 && strength <= 1
      ? { strength }
      : {}),
    ...(quality === "standard" || quality === "high" ? { quality } : {}),
    ...(image ? { image } : {}),
    ...(customImage ? { customImage } : {}),
  };
}

export interface LegacyDeps {
  readonly storage: Pick<Storage, "getItem">;
  readonly settings: CameraBackgroundSettings;
  readonly turnOn: (effect: string) => Promise<void>;
}

/** Saves the old choices, then turns the effect on (it reads them). */
export async function importLegacy(deps: LegacyDeps): Promise<void> {
  const old = legacyBackground(deps.storage);
  const { settings } = deps;
  if (old.strength !== undefined) await settings.set("strength", old.strength);
  if (old.quality) await settings.set("quality", old.quality);
  if (old.customImage) await settings.set("customImage", old.customImage);
  if (old.image) await settings.set("image", old.image);
  await settings.set("imported", true);
  if (old.effect) await deps.turnOn(old.effect);
}
