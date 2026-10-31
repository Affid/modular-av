import type {
  AudioEffectDefinition,
  AudioPlace,
  EffectDefinition,
  Registry,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import { AUDIO_PLACES } from "./audio-places.ts";

/** Where the player put each moved effect, by id: a client setting. */
export const EFFECT_PLACES_SETTING = "effectPlaces";
/** The player's order of each place, by place: a client setting. */
export const EFFECT_ORDER_SETTING = "effectOrder";

export type EffectOrder = Readonly<Record<AudioPlace, readonly string[]>>;

/** Where effects run, as the microphone applies it. */
export interface EffectPlacement {
  /** Every audio effect. */
  readonly places: Readonly<Record<string, AudioPlace>>;
  readonly order: EffectOrder;
}

export const NO_PLACEMENT: EffectPlacement = {
  places: {},
  order: { "pre-gate": [], "post-gate": [], send: [] },
};

export const isPlace = (value: unknown): value is AudioPlace =>
  AUDIO_PLACES.includes(value as AudioPlace);

export const savedRecord = (
  game: FoundryGame,
  setting: string,
): Readonly<Record<string, unknown>> => {
  const value: unknown = game.settings.get(MODULE_ID, setting);
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
};

const audioEffects = (
  effects: Registry<EffectDefinition>,
): readonly AudioEffectDefinition[] =>
  effects.list().filter((d) => d.kind === "audio");

/** Whatever is saved, only known places and registered effects count. */
export function readPlacement(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
): EffectPlacement {
  const audio = audioEffects(effects);
  const places = savedRecord(game, EFFECT_PLACES_SETTING);
  const order = savedRecord(game, EFFECT_ORDER_SETTING);
  const known = (place: AudioPlace): readonly string[] => {
    const ids = order[place];
    if (!Array.isArray(ids)) return [];
    return (ids as readonly unknown[]).filter((id): id is string =>
      audio.some((d) => d.id === id),
    );
  };
  return {
    places: Object.fromEntries(
      audio.map((d) => {
        const place = places[d.id];
        return [d.id, isPlace(place) ? place : d.defaultPlace];
      }),
    ),
    order: {
      "pre-gate": known("pre-gate"),
      "post-gate": known("post-gate"),
      send: known("send"),
    },
  };
}
