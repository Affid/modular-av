import type {
  AudioEffectDefinition,
  AudioPlace,
  EffectDefinition,
  Registry,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import { readPlacement } from "./effect-places.ts";

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

export const isLevel = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

export const hasMix = (
  definition: AudioEffectDefinition,
  place: AudioPlace,
): boolean => place === "send" || definition.latency !== undefined;

export const savedMix = (
  game: FoundryGame,
): Readonly<Record<string, unknown>> => {
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
  const { places } = readPlacement(game, effects);
  return {
    channel: isLevel(channel) ? channel : 1,
    mix: Object.fromEntries(
      effects.list().flatMap((d) => {
        const place = places[d.id];
        if (d.kind !== "audio" || !place || !hasMix(d, place)) return [];
        const mix = saved[d.id];
        return [[d.id, isLevel(mix) ? mix : (d.defaultMix ?? 1)] as const];
      }),
    ),
  };
}
