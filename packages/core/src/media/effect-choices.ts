import type { EffectDefinition, Registry } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
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
  readonly onError: (error: unknown) => void;
}

export interface EffectChoices {
  /** Hands the registered effects and the saved choice to the media. */
  apply(): void;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  /** Replaced by another of their group: no longer wanted. */
  replaced(ids: readonly string[]): void;
  readonly isSupported: (definition: EffectDefinition) => boolean;
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

export function createEffectChoices(deps: EffectChoicesDeps): EffectChoices {
  const { game, effects, local } = deps;

  /** Whatever the setting holds, only ids of registered effects count. */
  const saved = (): readonly string[] => {
    const value: unknown = game.settings.get(MODULE_ID, EFFECTS_SETTING);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (id): id is string => typeof id === "string" && !!effects.get(id),
    );
  };

  const apply = (ids: readonly string[] = saved()): void => {
    local.setEffects(effects.list(), new Set(ids));
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
    async setEnabled(id, enabled) {
      const definition = effects.get(id);
      if (!definition)
        throw new AVCommandError("unknown-effect", "No such effect", {
          effect: id,
        });
      if (enabled && !isEffectSupported(definition, deps.env))
        throw new AVCommandError(
          "unsupported",
          "This effect can't run in this browser",
          { effect: id },
        );
      const others = saved().filter((x) => x !== id);
      // Others of its group stay until it runs: never stop, then start.
      await save(enabled ? [...others, id] : others);
    },
    replaced(ids) {
      save(saved().filter((id) => !ids.includes(id))).catch(deps.onError);
    },
    isSupported: (definition) => isEffectSupported(definition, deps.env),
  };
}
