import type { EffectDefinition, LocalState } from "@modular-av/api";
import type { LayerStatus } from "../layers/layers.ts";
import {
  type Fader,
  fadersOf,
  type Rack,
  rackOf,
  type Slot,
} from "../model/rack.ts";
import type { EffectEntry, Snapshot } from "../model/snapshot.ts";

/** What the panels draw: the player's own, or another's from a report. */
export type ChainLocal = Pick<
  LocalState,
  | "chosenEffects"
  | "effects"
  | "audioEffectPlaces"
  | "audioEffectOrder"
  | "audioEffectMix"
  | "audioChannelLevel"
  | "audioCutTails"
>;

export interface ChainData {
  readonly definitions: readonly EffectDefinition[];
  readonly local: ChainLocal;
  readonly racks: readonly Rack[];
  readonly faders: readonly Fader[];
  /** What GM layers hold, locked here. */
  readonly held: Snapshot | null;
  /** The layers that hold it, named on what they lock. */
  readonly layers: readonly LayerStatus[];
}

const HOLDING: ReadonlySet<string> = new Set(["applied", "partly"]);

export function chainData(
  definitions: readonly EffectDefinition[],
  local: ChainLocal,
  held: Snapshot | null = null,
  layers: readonly LayerStatus[] = [],
): ChainData {
  const racks = rackOf(definitions, local);
  return {
    definitions,
    local,
    racks,
    faders: fadersOf(racks, local),
    held,
    layers: layers.filter((layer) => HOLDING.has(layer.state)),
  };
}

export const heldEntry = (
  data: ChainData,
  slot: Slot,
): EffectEntry | undefined => data.held?.effects[slot.effect.id];

/** Who set what a card shows, or null if the player did. */
export const heldBy = (data: ChainData, slot: Slot): string | null =>
  heldEntry(data, slot) && data.layers.length
    ? data.layers.map((layer) => layer.label).join(", ")
    : null;

/** A layer holds where it runs or the order around it. */
export const isPinned = (data: ChainData, slot: Slot): boolean =>
  heldEntry(data, slot)?.place !== undefined ||
  data.held?.order?.[slot.place] !== undefined;

/** What decides the cards and faders drawn; states and values change in place. */
export function shapeOf(data: ChainData): string {
  return JSON.stringify({
    racks: data.racks.map((rack) =>
      rack.slots.map((slot) => [slot.key, slot.effect.id]),
    ),
    faders: data.faders.map((fader) => fader.key),
    held: data.held,
    layers: data.layers.map((layer) => layer.label),
  });
}
