import type {
  AudioEffectDefinition,
  AudioPipelineChange,
  AudioPlace,
  Contribution,
  EffectDefinition,
  LocalState,
} from "@modular-av/api";
import { audioEffectsOf, lanesOf, PLACES } from "./pipeline.ts";
import {
  accepts,
  type SettingControl,
  settingsOf,
  type SettingValue,
  valueOf,
} from "./settings.ts";

/** What a preset or a GM's layer sets of one effect; the rest stays. */
export interface EffectEntry {
  readonly on?: boolean;
  readonly place?: AudioPlace;
  readonly mix?: number;
  readonly settings?: Readonly<Record<string, SettingValue>>;
}

/** The shape of a preset and of a layer: only the keys it sets. */
export interface Snapshot {
  readonly effects: Readonly<Record<string, EffectEntry>>;
  readonly order?: Partial<Readonly<Record<AudioPlace, readonly string[]>>>;
  readonly channelLevel?: number;
}

export type Pipeline = Pick<
  LocalState,
  | "chosenEffects"
  | "effects"
  | "audioEffectPlaces"
  | "audioEffectOrder"
  | "audioEffectMix"
  | "audioChannelLevel"
>;

const MAX_EFFECTS = 64;
const MAX_SETTINGS = 32;
const MAX_ID = 128;
const MAX_TEXT = 256;
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLevel = (value: unknown): value is number =>
  typeof value === "number" && value >= 0 && value <= 1;

const isPlace = (value: unknown): value is AudioPlace =>
  PLACES.includes(value as AudioPlace);

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_ID;

const isSetting = (value: unknown): value is SettingValue =>
  typeof value === "boolean" ||
  (typeof value === "string" && value.length <= MAX_TEXT) ||
  (typeof value === "number" && Number.isFinite(value));

const safeEntries = (
  value: Readonly<Record<string, unknown>>,
): readonly (readonly [string, unknown])[] =>
  Object.entries(value).filter(([key]) => !FORBIDDEN_KEYS.has(key));

function parseSettings(value: unknown): EffectEntry["settings"] | null {
  if (!isRecord(value)) return null;
  const entries = safeEntries(value);
  if (entries.length > MAX_SETTINGS) return null;
  if (!entries.every(([key, v]) => isId(key) && isSetting(v))) return null;
  return Object.fromEntries(entries) as Record<string, SettingValue>;
}

function parseEntry(value: unknown): EffectEntry | null {
  if (!isRecord(value)) return null;
  const { on, place, mix, settings } = value;
  if (on !== undefined && typeof on !== "boolean") return null;
  if (place !== undefined && !isPlace(place)) return null;
  if (mix !== undefined && !isLevel(mix)) return null;
  const parsed = settings === undefined ? undefined : parseSettings(settings);
  if (parsed === null) return null;
  return {
    ...(on === undefined ? {} : { on }),
    ...(place === undefined ? {} : { place }),
    ...(mix === undefined ? {} : { mix }),
    ...(parsed === undefined ? {} : { settings: parsed }),
  };
}

function parseOrder(value: unknown): Snapshot["order"] | null {
  if (!isRecord(value)) return null;
  const entries = safeEntries(value);
  const fine = entries.every(
    ([place, ids]) =>
      isPlace(place) &&
      Array.isArray(ids) &&
      ids.length <= MAX_EFFECTS &&
      (ids as readonly unknown[]).every(isId),
  );
  return fine ? Object.fromEntries(entries) : null;
}

/** What was stored is checked each time: a flag can hold anything. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value) || !isRecord(value.effects)) return null;
  const pairs = safeEntries(value.effects);
  if (pairs.length > MAX_EFFECTS) return null;
  const effects = pairs.map(([id, entry]) => [id, parseEntry(entry)] as const);
  if (!effects.every(([id, entry]) => isId(id) && entry)) return null;
  const { order, channelLevel } = value;
  const parsedOrder = order === undefined ? undefined : parseOrder(order);
  if (parsedOrder === null) return null;
  if (channelLevel !== undefined && !isLevel(channelLevel)) return null;
  return {
    effects: Object.fromEntries(effects) as Record<string, EffectEntry>,
    ...(parsedOrder === undefined ? {} : { order: parsedOrder }),
    ...(channelLevel === undefined ? {} : { channelLevel }),
  };
}

const placeOf = (
  d: AudioEffectDefinition,
  local: Pick<Pipeline, "audioEffectPlaces">,
): AudioPlace => local.audioEffectPlaces[d.id] ?? d.defaultPlace;

const hasMix = (d: AudioEffectDefinition, place: AudioPlace): boolean =>
  place === "send" || d.latency !== undefined;

function captureEffect(
  d: AudioEffectDefinition,
  local: Pipeline,
  contributions: readonly Contribution[],
): EffectEntry {
  const mix = local.audioEffectMix[d.id];
  const controls = settingsOf(contributions, d.id);
  return {
    on: local.chosenEffects.includes(d.id),
    place: placeOf(d, local),
    ...(mix === undefined ? {} : { mix }),
    ...(controls.length
      ? {
          settings: Object.fromEntries(controls.map((c) => [c.id, valueOf(c)])),
        }
      : {}),
  };
}

/** The whole channel of this client, in a call or not. */
export function captureSnapshot(
  definitions: readonly EffectDefinition[],
  local: Pipeline,
  contributions: readonly Contribution[],
): Snapshot {
  const audio = audioEffectsOf(definitions);
  return {
    effects: Object.fromEntries(
      audio.map((d) => [d.id, captureEffect(d, local, contributions)]),
    ),
    order: Object.fromEntries(
      lanesOf(audio, local).map((lane) => [
        lane.place,
        lane.effects.map((d) => d.id),
      ]),
    ),
    channelLevel: local.audioChannelLevel,
  };
}

export interface Plan {
  /** To turn off first. */
  readonly off: readonly string[];
  /** Applied once. */
  readonly change: AudioPipelineChange;
  readonly settings: readonly {
    readonly control: SettingControl;
    readonly value: SettingValue;
  }[];
  /** To turn on last, so they start with their settings. */
  readonly on: readonly string[];
  /** Not registered here. */
  readonly missing: readonly string[];
  /** This browser can't run them. */
  readonly unsupported: readonly string[];
}

interface Known {
  readonly definition: AudioEffectDefinition;
  readonly entry: EffectEntry;
}

function sortOut(
  snapshot: Snapshot,
  audio: readonly AudioEffectDefinition[],
  local: Pipeline,
) {
  const ids = Object.keys(snapshot.effects);
  const definitionOf = (id: string) => audio.find((d) => d.id === id);
  const unsupported = ids.filter(
    (id) =>
      definitionOf(id) &&
      snapshot.effects[id]?.on === true &&
      local.effects[id]?.status === "unsupported",
  );
  const known = ids.flatMap((id): Known[] => {
    const definition = definitionOf(id);
    const entry = snapshot.effects[id];
    return definition && entry && !unsupported.includes(id)
      ? [{ definition, entry }]
      : [];
  });
  return { known, unsupported, missing: ids.filter((id) => !definitionOf(id)) };
}

function pipelineChange(
  snapshot: Snapshot,
  known: readonly Known[],
  audio: readonly AudioEffectDefinition[],
  local: Pipeline,
): AudioPipelineChange {
  const placed = known.flatMap((k) =>
    k.entry.place ? [[k.definition.id, k.entry.place] as const] : [],
  );
  const finalPlace = (d: AudioEffectDefinition): AudioPlace =>
    snapshot.effects[d.id]?.place ?? placeOf(d, local);
  const mixed = known.flatMap(({ definition, entry }) =>
    entry.mix !== undefined && hasMix(definition, finalPlace(definition))
      ? [[definition.id, entry.mix] as const]
      : [],
  );
  const order = Object.entries(snapshot.order ?? {}).map(
    ([place, ids]) =>
      [
        place,
        ids.filter((id) => {
          const definition = audio.find((d) => d.id === id);
          return definition && finalPlace(definition) === place;
        }),
      ] as const,
  );
  return {
    ...(placed.length ? { places: Object.fromEntries(placed) } : {}),
    ...(order.length ? { order: Object.fromEntries(order) } : {}),
    ...(mixed.length ? { mix: Object.fromEntries(mixed) } : {}),
    ...(snapshot.channelLevel === undefined
      ? {}
      : { channelLevel: snapshot.channelLevel }),
  };
}

function settingWrites(
  known: readonly Known[],
  contributions: readonly Contribution[],
): Plan["settings"] {
  return known.flatMap(({ definition, entry }) => {
    const controls = settingsOf(contributions, definition.id);
    return Object.entries(entry.settings ?? {}).flatMap(([id, value]) => {
      const control = controls.find((c) => c.id === id);
      return control && accepts(control, value) ? [{ control, value }] : [];
    });
  });
}

/**
 * What applying `snapshot` takes, from here. An effect swapped within its
 * exclusive group isn't turned off first, or noise suppression would gap.
 */
export function planSnapshot(
  snapshot: Snapshot,
  definitions: readonly EffectDefinition[],
  local: Pipeline,
  contributions: readonly Contribution[],
): Plan {
  const audio = audioEffectsOf(definitions);
  const { known, unsupported, missing } = sortOut(snapshot, audio, local);
  const chosen = (id: string): boolean => local.chosenEffects.includes(id);
  const starting = known.filter((k) => k.entry.on === true);
  const swapped = ({ definition }: Known): boolean =>
    definition.exclusiveGroup !== undefined &&
    starting.some(
      (k) => k.definition.exclusiveGroup === definition.exclusiveGroup,
    );
  return {
    off: known
      .filter((k) => k.entry.on === false)
      .filter((k) => chosen(k.definition.id) && !swapped(k))
      .map((k) => k.definition.id),
    change: pipelineChange(snapshot, known, audio, local),
    settings: settingWrites(known, contributions),
    on: starting.map((k) => k.definition.id).filter((id) => !chosen(id)),
    missing,
    unsupported,
  };
}

function entryMatches(
  { definition, entry }: Known,
  local: Pipeline,
  contributions: readonly Contribution[],
): boolean {
  const { id } = definition;
  const place = placeOf(definition, local);
  if (entry.on !== undefined && entry.on !== local.chosenEffects.includes(id))
    return false;
  if (entry.place !== undefined && entry.place !== place) return false;
  if (
    entry.mix !== undefined &&
    hasMix(definition, place) &&
    entry.mix !== local.audioEffectMix[id]
  )
    return false;
  const controls = settingsOf(contributions, id);
  return Object.entries(entry.settings ?? {}).every(([key, value]) => {
    const control = controls.find((c) => c.id === key);
    return !control || valueOf(control) === value;
  });
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

function orderMatches(
  snapshot: Snapshot,
  audio: readonly AudioEffectDefinition[],
  local: Pipeline,
): boolean {
  return lanesOf(audio, local).every((lane) => {
    const ids = lane.effects.map((d) => d.id);
    const saved = (snapshot.order?.[lane.place] ?? []).filter((id) =>
      ids.includes(id),
    );
    return sameList(
      ids.filter((id) => saved.includes(id)),
      saved,
    );
  });
}

/** Whether the channel is what `snapshot` asks for, as far as it can speak. */
export function matchesSnapshot(
  snapshot: Snapshot,
  definitions: readonly EffectDefinition[],
  local: Pipeline,
  contributions: readonly Contribution[],
): boolean {
  const audio = audioEffectsOf(definitions);
  const { known } = sortOut(snapshot, audio, local);
  return (
    known.every((k) => entryMatches(k, local, contributions)) &&
    orderMatches(snapshot, audio, local) &&
    (snapshot.channelLevel === undefined ||
      snapshot.channelLevel === local.audioChannelLevel)
  );
}
