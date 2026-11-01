import type { EffectDefinition, Registry } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import type { LocalMedia } from "./local-media.ts";
import type { MediaEnv } from "./env.ts";

/** The effects this device turns on: a client setting, a list of ids. */
export const EFFECTS_SETTING = "effects";

export interface EffectChoicesDeps {
  readonly game: FoundryGame;
  readonly env: Pick<MediaEnv, "canWatchFrames">;
  readonly effects: Registry<EffectDefinition>;
  readonly local: LocalMedia;
  /** What the call's service offers (see `EffectDefinition.requires`). */
  readonly features: () => ReadonlySet<string>;
  readonly onError: (error: unknown) => void;
}

export interface EffectChoices {
  /** Hands the registered effects and the saved choice to the media. */
  apply(): void;
  saved(): readonly string[];
  /** Hands the choice to the media at once, and saves it. */
  save(ids: readonly string[]): Promise<void>;
  /** Replaced by another of their group: no longer wanted. */
  replaced(ids: readonly string[]): void;
  readonly isSupported: (definition: EffectDefinition) => boolean;
  /** The call's service offers what it requires. */
  readonly isAvailable: (definition: EffectDefinition) => boolean;
}

/** Video effects also need the frame watchdog, or they can't fail closed. */
export function isEffectSupported(
  definition: EffectDefinition,
  env: Pick<MediaEnv, "canWatchFrames">,
): boolean {
  if (definition.kind === "video" && !env.canWatchFrames()) return false;
  try {
    return definition.isSupported();
  } catch {
    return false;
  }
}

export function isEffectAvailable(
  definition: EffectDefinition,
  features: ReadonlySet<string>,
): boolean {
  return (definition.requires ?? []).every((f) => features.has(f));
}

/** Whatever the setting holds, only ids of registered effects count. */
export function savedEffects(
  game: FoundryGame,
  effects: Pick<Registry<EffectDefinition>, "get">,
): readonly string[] {
  const value: unknown = game.settings.get(MODULE_ID, EFFECTS_SETTING);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === "string" && !!effects.get(id),
  );
}

export function createEffectChoices(deps: EffectChoicesDeps): EffectChoices {
  const { game, effects, local } = deps;

  const saved = (): readonly string[] => savedEffects(game, effects);

  const isAvailable = (definition: EffectDefinition): boolean =>
    isEffectAvailable(definition, deps.features());

  /** A saved choice that is unavailable waits: it isn't handed over. */
  const apply = (ids: readonly string[] = saved()): void => {
    local.setEffects(effects.list().filter(isAvailable), new Set(ids));
  };

  const save = (ids: readonly string[]): Promise<void> => {
    apply(ids);
    return game.settings
      .set(MODULE_ID, EFFECTS_SETTING, [...ids])
      .then(() => undefined);
  };

  return {
    apply: () => {
      apply();
    },
    saved,
    save,
    replaced(ids) {
      save(saved().filter((id) => !ids.includes(id))).catch(deps.onError);
    },
    isSupported: (definition) => isEffectSupported(definition, deps.env),
    isAvailable,
  };
}
