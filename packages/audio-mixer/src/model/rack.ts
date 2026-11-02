import type {
  AudioEffectDefinition,
  AudioPipelineChange,
  AudioPlace,
  EffectDefinition,
  LocalState,
} from "@modular-av/api";
import {
  audioEffectsOf,
  lanesOf,
  NOISE_SUPPRESSION,
  PLACES,
} from "./pipeline.ts";

/** The noise models' one card. */
export const NOISE_KEY = `group:${NOISE_SUPPRESSION}`;

type Chain = Pick<
  LocalState,
  | "chosenEffects"
  | "effects"
  | "audioEffectPlaces"
  | "audioEffectOrder"
  | "audioEffectMix"
>;

/** A card: one effect, or the noise models as one. */
export interface Slot {
  readonly key: string;
  /** What runs, or would run once switched on. */
  readonly effect: AudioEffectDefinition;
  /** The noise models, for a group; the effect alone otherwise. */
  readonly members: readonly AudioEffectDefinition[];
  readonly place: AudioPlace;
}

export interface Rack {
  readonly place: AudioPlace;
  /** In the order they run. */
  readonly slots: readonly Slot[];
}

/** What a change to the chain writes: the pipeline first, then switches. */
export interface ChainPlan {
  readonly change: AudioPipelineChange;
  readonly enable: readonly (readonly [string, boolean])[];
}

const isNoise = (d: AudioEffectDefinition): boolean =>
  d.exclusiveGroup === NOISE_SUPPRESSION;

/** On, or off but kept: its place's order lists it. */
const inChain = (local: Chain, d: AudioEffectDefinition, place: AudioPlace) =>
  local.chosenEffects.includes(d.id) ||
  local.audioEffectOrder[place].includes(d.id);

/**
 * What the player put in the chain, in the order it runs. The noise models
 * are one card, in the place of the one that runs, else the first kept.
 */
export function rackOf(
  definitions: readonly EffectDefinition[],
  local: Chain,
): readonly Rack[] {
  const audio = audioEffectsOf(definitions);
  const members = audio.filter(isNoise);
  const lanes = lanesOf(audio, local).map((lane) => ({
    place: lane.place,
    effects: lane.effects.filter((d) => inChain(local, d, lane.place)),
  }));
  const noise = lanes
    .flatMap((lane) => lane.effects.filter(isNoise))
    .sort(
      (a, b) =>
        Number(local.chosenEffects.includes(b.id)) -
        Number(local.chosenEffects.includes(a.id)),
    )[0];
  return lanes.map(({ place, effects }) => ({
    place,
    slots: effects.flatMap((d): Slot[] => {
      if (!isNoise(d)) return [{ key: d.id, effect: d, members: [d], place }];
      return d === noise ? [{ key: NOISE_KEY, effect: d, members, place }] : [];
    }),
  }));
}

const ids = (rack: Rack): readonly string[] =>
  rack.slots.map((slot) => slot.effect.id);

const rackAt = (racks: readonly Rack[], place: AudioPlace): Rack =>
  racks.find((rack) => rack.place === place) ?? { place, slots: [] };

export const slotOf = (racks: readonly Rack[], key: string): Slot | undefined =>
  racks.flatMap((rack) => rack.slots).find((slot) => slot.key === key);

const plan = (
  change: AudioPipelineChange,
  enable: ChainPlan["enable"] = [],
): ChainPlan => ({ change, enable });

/** `key`'s card to `place` at `index` (the end by default). */
export function moveTo(
  racks: readonly Rack[],
  key: string,
  place: AudioPlace,
  index?: number,
): ChainPlan | null {
  const slot = slotOf(racks, key);
  if (!slot) return null;
  const id = slot.effect.id;
  const from = ids(rackAt(racks, slot.place)).filter((other) => other !== id);
  const target = slot.place === place ? from : ids(rackAt(racks, place));
  const at = Math.min(index ?? target.length, target.length);
  const to = [...target.slice(0, at), id, ...target.slice(at)];
  if (slot.place === place)
    return to.join() === ids(rackAt(racks, place)).join()
      ? null
      : plan({ order: { [place]: to } });
  return plan({
    places: { [id]: place },
    order: { [slot.place]: from, [place]: to },
  });
}

/** One step earlier (-1) or later (1) in its place, or null at the end. */
export function moveWithin(
  racks: readonly Rack[],
  key: string,
  by: -1 | 1,
): ChainPlan | null {
  const slot = slotOf(racks, key);
  if (!slot) return null;
  const at = rackAt(racks, slot.place).slots.indexOf(slot) + by;
  if (at < 0 || at >= rackAt(racks, slot.place).slots.length) return null;
  return moveTo(racks, key, slot.place, at);
}

/** Into the chain at the end of `place`, switched on; moved if already in. */
export function addTo(
  racks: readonly Rack[],
  definition: AudioEffectDefinition,
  place: AudioPlace,
): ChainPlan {
  const key = isNoise(definition) ? NOISE_KEY : definition.id;
  const known = slotOf(racks, key);
  if (known?.effect.id === definition.id) {
    const moved = moveTo(racks, key, place);
    return moved ?? plan({});
  }
  const id = definition.id;
  return plan(
    {
      places: { [id]: place },
      order: { [place]: [...ids(rackAt(racks, place)), id] },
    },
    [[id, true]],
  );
}

/** Switched off, it stays: its place's order lists it from then on. */
export function setOn(
  racks: readonly Rack[],
  key: string,
  on: boolean,
): ChainPlan | null {
  const slot = slotOf(racks, key);
  if (!slot) return null;
  const id = slot.effect.id;
  return on
    ? plan({}, [[id, true]])
    : plan({ order: { [slot.place]: ids(rackAt(racks, slot.place)) } }, [
        [id, false],
      ]);
}

/** Out of the chain: off, and out of its place's order. */
export function removeFrom(
  racks: readonly Rack[],
  key: string,
): ChainPlan | null {
  const slot = slotOf(racks, key);
  if (!slot) return null;
  return plan(
    {
      order: {
        [slot.place]: ids(rackAt(racks, slot.place)).filter(
          (id) => id !== slot.effect.id,
        ),
      },
    },
    [[slot.effect.id, false]],
  );
}

/** Another noise model in the card's slot; it runs if the card was on. */
export function switchModel(
  racks: readonly Rack[],
  model: string,
  local: Pick<Chain, "chosenEffects">,
): ChainPlan | null {
  const slot = slotOf(racks, NOISE_KEY);
  const next = slot?.members.find((d) => d.id === model);
  if (!slot || !next || next === slot.effect) return null;
  return plan(
    {
      places: { [model]: slot.place },
      order: {
        [slot.place]: ids(rackAt(racks, slot.place)).map((id) =>
          id === slot.effect.id ? model : id,
        ),
      },
    },
    local.chosenEffects.includes(slot.effect.id) ? [[model, true]] : [],
  );
}

export type CardState =
  "on" | "starting" | "off" | "idle" | "waiting" | "failed" | "unsupported";

const STATE_OF: Readonly<Record<string, CardState>> = {
  running: "on",
  starting: "starting",
  failed: "failed",
  unavailable: "waiting",
  unsupported: "unsupported",
  off: "idle",
};

/** "idle": on, but there's no microphone for it yet. */
export function cardStateOf(slot: Slot, local: Chain): CardState {
  const status = local.effects[slot.effect.id]?.status ?? "off";
  if (status === "unsupported") return "unsupported";
  if (!local.chosenEffects.includes(slot.effect.id)) return "off";
  return STATE_OF[status] ?? "idle";
}

/** A level: a send's Return level, or an insert's dry:wet. */
export interface Fader {
  readonly key: string;
  readonly effect: AudioEffectDefinition;
  readonly place: AudioPlace;
  readonly value: number;
}

export function fadersOf(
  racks: readonly Rack[],
  local: Pick<Chain, "audioEffectMix">,
): readonly Fader[] {
  return racks.flatMap((rack) =>
    rack.slots.flatMap((slot) => {
      const value = local.audioEffectMix[slot.effect.id];
      return value === undefined
        ? []
        : [{ key: slot.key, effect: slot.effect, place: rack.place, value }];
    }),
  );
}

/** Something the browser can add. */
export interface Offer {
  readonly key: string;
  /** What adding it runs: for the noise models, the first that can. */
  readonly effect: AudioEffectDefinition;
  readonly unsupported: boolean;
}

export interface Offers {
  readonly recent: readonly Offer[];
  /** Made for the place it opened from. */
  readonly forPlace: readonly Offer[];
  readonly others: readonly Offer[];
  /** Already in: choosing one moves it here. */
  readonly inChain: readonly Offer[];
}

const statusOf = (local: Chain, d: AudioEffectDefinition): string =>
  local.effects[d.id]?.status ?? "off";

/** One offer per card, leaving out what the call can't run (API rule). */
function offersOf(
  definitions: readonly EffectDefinition[],
  local: Chain,
): readonly Offer[] {
  const audio = audioEffectsOf(definitions).filter(
    (d) => statusOf(local, d) !== "unavailable",
  );
  const runnable = (d: AudioEffectDefinition) =>
    statusOf(local, d) !== "unsupported";
  const noise = audio.filter(isNoise);
  const model = noise.find(runnable) ?? noise[0];
  const offer = (key: string, d: AudioEffectDefinition): Offer => ({
    key,
    effect: d,
    unsupported: !runnable(d),
  });
  return [
    ...(model ? [offer(NOISE_KEY, model)] : []),
    ...audio.filter((d) => !isNoise(d)).map((d) => offer(d.id, d)),
  ];
}

/** The browser opened from `place`'s "+", most likely first. */
export function offersFor(
  definitions: readonly EffectDefinition[],
  local: Chain,
  racks: readonly Rack[],
  place: AudioPlace,
  recent: readonly string[],
): Offers {
  const all = offersOf(definitions, local);
  const chained = all.filter((o) => slotOf(racks, o.key) !== undefined);
  const free = all.filter((o) => !chained.includes(o));
  const recentOffers = recent.flatMap((key) =>
    free.filter((o) => o.key === key),
  );
  const rest = free.filter((o) => !recentOffers.includes(o));
  return {
    recent: recentOffers,
    forPlace: rest.filter((o) => o.effect.defaultPlace === place),
    others: rest.filter((o) => o.effect.defaultPlace !== place),
    inChain: chained,
  };
}

export { PLACES };
