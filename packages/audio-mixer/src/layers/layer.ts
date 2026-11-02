import type { AudioPlace, EffectDefinition } from "@modular-av/api";
import { audioEffectsOf, NOISE_SUPPRESSION } from "../model/pipeline.ts";
import {
  type EffectEntry,
  parseSnapshot,
  type Snapshot,
} from "../model/snapshot.ts";

const MAX_LABEL = 64;
const MAX_ID = 64;

/**
 * A GM's change on top of a player's setup: the shape of a preset, with only
 * the keys it sets. By its shape it can't touch devices, voice mode, input
 * sensitivity, mute or anything else that isn't the channel.
 */
export interface Layer extends Snapshot {
  readonly id: string;
  readonly label: string;
  /** A table layer reaches GMs too. */
  readonly includeGMs: boolean;
}

/** What the layers on this device took over, and which layers those are. */
export interface UndoRecord {
  readonly ids: readonly string[];
  readonly values: Snapshot;
}

const parseJson = (stored: unknown): unknown => {
  if (typeof stored !== "string" || !stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    // Not what this module wrote.
    return null;
  }
};

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/** A layer is checked by every client, each time: only its shape is kept. */
export function parseLayer(stored: unknown): Layer | null {
  const value = parseJson(stored) as Partial<Layer> | null;
  const snapshot = parseSnapshot(value);
  if (!value || !snapshot) return null;
  const { id, label, includeGMs } = value;
  if (!isText(id, MAX_ID) || !isText(label, MAX_LABEL)) return null;
  return { ...snapshot, id, label, includeGMs: includeGMs === true };
}

export function parseUndo(stored: unknown): UndoRecord | null {
  const value = parseJson(stored) as Partial<UndoRecord> | null;
  const values = parseSnapshot(value?.values);
  const ids = value?.ids;
  if (!values || !Array.isArray(ids)) return null;
  return ids.every((id) => typeof id === "string") ? { ids, values } : null;
}

/** What a saved preset means as a layer: what it turns on, and no more. */
export function layerFromSnapshot(
  snapshot: Snapshot,
  definitions: readonly EffectDefinition[],
  identity: Pick<Layer, "id" | "label" | "includeGMs">,
): Layer {
  const audio = audioEffectsOf(definitions);
  const usable = ([id, entry]: readonly [string, EffectEntry]): boolean =>
    entry.on === true &&
    audio.find((d) => d.id === id)?.exclusiveGroup !== NOISE_SUPPRESSION;
  const level = snapshot.channelLevel;
  return {
    ...identity,
    effects: Object.fromEntries(
      Object.entries(snapshot.effects).filter(usable),
    ),
    ...(level === undefined || level === 1 ? {} : { channelLevel: level }),
  };
}

const mergeEntry = (a: EffectEntry = {}, b: EffectEntry = {}): EffectEntry => ({
  ...a,
  ...b,
  ...(a.settings || b.settings
    ? { settings: { ...a.settings, ...b.settings } }
    : {}),
});

const mergeTwo = (under: Snapshot, over: Snapshot): Snapshot => {
  const ids = [
    ...new Set([...Object.keys(under.effects), ...Object.keys(over.effects)]),
  ];
  const order = { ...under.order, ...over.order };
  const level = over.channelLevel ?? under.channelLevel;
  return {
    effects: Object.fromEntries(
      ids.map((id) => [id, mergeEntry(under.effects[id], over.effects[id])]),
    ),
    ...(Object.keys(order).length ? { order } : {}),
    ...(level === undefined ? {} : { channelLevel: level }),
  };
};

/** In order: the table's, then a personal one overriding it key by key. */
export function mergeLayers(layers: readonly Snapshot[]): Snapshot | null {
  const [first, ...rest] = layers;
  return first ? rest.reduce(mergeTwo, first) : null;
}

const pickEntry = (held: EffectEntry, from: EffectEntry): EffectEntry => {
  const settings = Object.keys(held.settings ?? {}).filter(
    (key) => from.settings?.[key] !== undefined,
  );
  return {
    ...(held.on === undefined || from.on === undefined ? {} : { on: from.on }),
    ...(held.place === undefined || from.place === undefined
      ? {}
      : { place: from.place }),
    ...(held.mix === undefined || from.mix === undefined
      ? {}
      : { mix: from.mix }),
    ...(settings.length
      ? {
          settings: Object.fromEntries(
            settings.flatMap((key) => {
              const value = from.settings?.[key];
              return value === undefined ? [] : [[key, value]];
            }),
          ),
        }
      : {}),
  };
};

/** Of `from`, the keys `held` sets. */
function pick(held: Snapshot, from: Snapshot): Snapshot {
  const order = Object.keys(held.order ?? {}).flatMap(
    (place): [string, readonly string[]][] => {
      const ids = from.order?.[place as AudioPlace];
      return ids ? [[place, ids]] : [];
    },
  );
  const level = held.channelLevel === undefined ? undefined : from.channelLevel;
  return {
    effects: Object.fromEntries(
      Object.entries(held.effects).flatMap(([id, entry]) => {
        const known = from.effects[id];
        return known ? [[id, pickEntry(entry, known)]] : [];
      }),
    ),
    ...(order.length ? { order: Object.fromEntries(order) } : {}),
    ...(level === undefined ? {} : { channelLevel: level }),
  };
}

const withoutEntry = (entry: EffectEntry, held: EffectEntry): EffectEntry => {
  const settings = Object.entries(entry.settings ?? {}).filter(
    ([key]) => held.settings?.[key] === undefined,
  );
  return {
    ...(entry.on === undefined || held.on !== undefined
      ? {}
      : { on: entry.on }),
    ...(entry.place === undefined || held.place !== undefined
      ? {}
      : { place: entry.place }),
    ...(entry.mix === undefined || held.mix !== undefined
      ? {}
      : { mix: entry.mix }),
    ...(settings.length ? { settings: Object.fromEntries(settings) } : {}),
  };
};

/** `snapshot` without the keys `held` sets. */
function without(snapshot: Snapshot, held: Snapshot): Snapshot {
  const order = Object.entries(snapshot.order ?? {}).filter(
    ([place]) => held.order?.[place as AudioPlace] === undefined,
  );
  const level =
    held.channelLevel === undefined ? snapshot.channelLevel : undefined;
  return {
    effects: Object.fromEntries(
      Object.entries(snapshot.effects).map(([id, entry]) => {
        const over = held.effects[id];
        return [id, over ? withoutEntry(entry, over) : entry];
      }),
    ),
    ...(order.length ? { order: Object.fromEntries(order) } : {}),
    ...(level === undefined ? {} : { channelLevel: level }),
  };
}

const isEmptyEntry = (entry: EffectEntry): boolean =>
  Object.keys(entry).length === 0;

/** Without effects it says nothing about. */
const pruned = (snapshot: Snapshot): Snapshot => ({
  ...snapshot,
  effects: Object.fromEntries(
    Object.entries(snapshot.effects).filter(([, e]) => !isEmptyEntry(e)),
  ),
});

export interface ReconcileStep {
  /** To apply: the layers, and what they no longer hold given back. */
  readonly target: Snapshot;
  /** The record to save first: nothing to give back is lost in a crash. */
  readonly keep: Snapshot;
  /** The record once applied; null when nothing is held. */
  readonly undo: Snapshot | null;
}

/**
 * Repeatable from any state, so a reload mid-cave lands in the same place and
 * a layer that ended while a player was away is undone at their next load.
 */
export function reconcileStep(
  merged: Snapshot | null,
  record: Snapshot | null,
  current: Snapshot,
): ReconcileStep | null {
  if (!merged && !record) return null;
  const held = merged ?? { effects: {} };
  const under = record ?? { effects: {} };
  const undo = mergeTwo(pick(held, current), pick(held, under));
  const released = pruned(without(under, held));
  return {
    target: pruned(mergeTwo(released, held)),
    keep: mergeTwo(under, undo),
    undo: merged ? undo : null,
  };
}

/**
 * A preset applied during a layer: the keys the layer holds wait in the record
 * for when it ends, and the rest applies at once.
 */
export function splitHeld(
  snapshot: Snapshot,
  record: Snapshot,
): { readonly free: Snapshot; readonly undo: Snapshot } {
  return {
    free: without(snapshot, record),
    undo: mergeTwo(record, pick(record, snapshot)),
  };
}

/** The channel as it would be without the layers: for saving a preset. */
export const underneath = (current: Snapshot, record: Snapshot): Snapshot =>
  mergeTwo(current, record);
