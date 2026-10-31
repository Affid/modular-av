import type {
  AudioEffectDefinition,
  EffectDefinition,
  Registry,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** The dry amount: a client setting. */
export const CHANNEL_LEVEL_SETTING = "channelLevel";
/** The player's dry:wet and wet amounts, by effect id: a client setting. */
export const EFFECT_MIX_SETTING = "effectMix";

/** What the player set, as the microphone applies it. */
export interface VoiceLevels {
  readonly channel: number;
  /** Only effects that have a mix. */
  readonly mix: Readonly<Record<string, number>>;
}

const isLevel = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/** A `send` effect has its Return level; an insert needs its latency. */
export const hasMix = (definition: AudioEffectDefinition): boolean =>
  definition.defaultPlace === "send" || definition.latency !== undefined;

const savedMix = (game: FoundryGame): Readonly<Record<string, unknown>> => {
  const value: unknown = game.settings.get(MODULE_ID, EFFECT_MIX_SETTING);
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
};

/** What is saved, the defaults for anything malformed. */
export function readLevels(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
): VoiceLevels {
  const channel: unknown = game.settings.get(MODULE_ID, CHANNEL_LEVEL_SETTING);
  const saved = savedMix(game);
  return {
    channel: isLevel(channel) ? channel : 1,
    mix: Object.fromEntries(
      effects.list().flatMap((d) => {
        if (d.kind !== "audio" || !hasMix(d)) return [];
        const mix = saved[d.id];
        return [[d.id, isLevel(mix) ? mix : (d.defaultMix ?? 1)] as const];
      }),
    ),
  };
}

const checked = (value: number, name: string): void => {
  if (!isLevel(value))
    throw new AVCommandError(
      "invalid-argument",
      `${name} must be between 0 and 1`,
      { [name]: String(value) },
    );
};

export async function writeChannelLevel(
  game: FoundryGame,
  level: number,
): Promise<void> {
  checked(level, "level");
  await game.settings.set(MODULE_ID, CHANNEL_LEVEL_SETTING, level);
}

/** Throws for an effect without a mix, and for anything but 0 to 1. */
export async function writeEffectMix(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
  id: string,
  mix: number,
): Promise<void> {
  checked(mix, "mix");
  const definition = effects.get(id);
  if (!definition)
    throw new AVCommandError("unknown-effect", "No such effect", {
      effect: id,
    });
  if (definition.kind !== "audio" || !hasMix(definition))
    throw new AVCommandError(
      "invalid-argument",
      "This effect has no dry:wet control",
      { effect: id },
    );
  await game.settings.set(MODULE_ID, EFFECT_MIX_SETTING, {
    ...savedMix(game),
    [id]: mix,
  });
}
