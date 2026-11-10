import type { EffectDefinition, Registry } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import type { LocalMedia } from "./local-media.ts";
import type { MediaEnv } from "./env.ts";

/**
 * The camera effects this device turns on: a device setting, a list of ids
 * (before player settings it held the voice effects too). A camera effect
 * depends on the machine; the voice effects follow the player.
 */
export const EFFECTS_SETTING = "effects";
/** The voice effects the player turns on: a player setting, a list of ids. */
export const AUDIO_EFFECTS_SETTING = "audioEffects";

export interface EffectChoicesDeps {
  readonly game: FoundryGame;
  /** Saves one of the core's settings, one at a time. */
  readonly save: (key: string, value: unknown) => Promise<void>;
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

/** Whatever the settings hold, only ids of registered effects of their kind count. */
export function savedEffects(
  game: FoundryGame,
  effects: Pick<Registry<EffectDefinition>, "get">,
): readonly string[] {
  const of = (key: string, audio: boolean): string[] => {
    const value: unknown = game.settings.get(MODULE_ID, key);
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => {
      const kind = typeof id === "string" ? effects.get(id)?.kind : undefined;
      return kind !== undefined && (kind === "audio") === audio;
    });
  };
  return [...of(AUDIO_EFFECTS_SETTING, true), ...of(EFFECTS_SETTING, false)];
}

export function createEffectChoices(deps: EffectChoicesDeps): EffectChoices {
  const { game, effects, local } = deps;

  /**
   * The list being saved: the player's half saves on the server, and a
   * replacement read before it lands would write the old list back.
   */
  let saving: readonly string[] | null = null;
  const saved = (): readonly string[] => saving ?? savedEffects(game, effects);

  const isAvailable = (definition: EffectDefinition): boolean =>
    isEffectAvailable(definition, deps.features());

  /** A saved choice that is unavailable waits: it isn't handed over. */
  const apply = (ids: readonly string[] = saved()): void => {
    local.setEffects(effects.list().filter(isAvailable), new Set(ids));
  };

  /**
   * Saves only the half that changed: saving the player's voice half when
   * only a camera effect changed would claim it, and keep another
   * browser's earlier voice choices from moving to the player.
   */
  const save = async (ids: readonly string[]): Promise<void> => {
    const before = saved();
    const mine = [...ids];
    saving = mine;
    apply(mine);
    const audio = (id: string): boolean => effects.get(id)?.kind === "audio";
    const halves = [
      { key: AUDIO_EFFECTS_SETTING, keep: audio },
      { key: EFFECTS_SETTING, keep: (id: string) => !audio(id) },
    ];
    try {
      await Promise.all(
        halves.flatMap(({ key, keep }) => {
          const next = mine.filter(keep);
          const was = before.filter(keep);
          const same =
            next.length === was.length && next.every((id, i) => id === was[i]);
          return same ? [] : [deps.save(key, next)];
        }),
      );
    } finally {
      if (saving === mine) saving = null;
    }
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
