import type {
  AudioEffectDefinition,
  AudioPipelineChange,
  AudioPlace,
  EffectDefinition,
  LocalState,
} from "@modular-av/api";

/** In the order they run. */
export const PLACES: readonly AudioPlace[] = ["pre-gate", "post-gate", "send"];

/** Its effects run first, unless the player's order says otherwise. */
export const NOISE_SUPPRESSION = "noise-suppression";

export interface Lane {
  readonly place: AudioPlace;
  /** In the order they run. */
  readonly effects: readonly AudioEffectDefinition[];
}

export const audioEffectsOf = (
  definitions: readonly EffectDefinition[],
): readonly AudioEffectDefinition[] =>
  definitions.filter((d) => d.kind === "audio");

const isNoiseSuppression = (d: AudioEffectDefinition): boolean =>
  d.exclusiveGroup === NOISE_SUPPRESSION;

/** As the core's `orderByPlace` runs them, so the window shows what happens. */
export function lanesOf(
  definitions: readonly EffectDefinition[],
  local: Pick<LocalState, "audioEffectPlaces" | "audioEffectOrder">,
): readonly Lane[] {
  const audio = audioEffectsOf(definitions);
  return PLACES.map((place) => {
    const here = audio.filter(
      (d) => (local.audioEffectPlaces[d.id] ?? d.defaultPlace) === place,
    );
    const listed = local.audioEffectOrder[place];
    const rest = here.filter((d) => !listed.includes(d.id));
    return {
      place,
      effects: [
        ...rest.filter(isNoiseSuppression),
        ...listed.flatMap((id) => here.filter((d) => d.id === id)),
        ...rest.filter((d) => !isNoiseSuppression(d)),
      ],
    };
  });
}

/** `ids` with `id` swapped with its neighbour, or null at the end or absent. */
export function reorder(
  ids: readonly string[],
  id: string,
  by: -1 | 1,
): readonly string[] | null {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  return ids.map((other, i) => {
    if (i === from) return ids[to] ?? other;
    return i === to ? id : other;
  });
}

const idsIn = (lane: Lane): readonly string[] => lane.effects.map((d) => d.id);

const laneWith = (lanes: readonly Lane[], id: string): Lane | undefined =>
  lanes.find((lane) => lane.effects.some((d) => d.id === id));

/** One step up or down its lane, or null if it is at the end. */
export function moveChange(
  lanes: readonly Lane[],
  id: string,
  by: -1 | 1,
): AudioPipelineChange | null {
  const lane = laneWith(lanes, id);
  const order = lane && reorder(idsIn(lane), id, by);
  return lane && order ? { order: { [lane.place]: order } } : null;
}

/** To the end of `place`, or null if it is already there. */
export function placeChange(
  lanes: readonly Lane[],
  id: string,
  place: AudioPlace,
): AudioPipelineChange | null {
  const from = laneWith(lanes, id);
  const to = lanes.find((lane) => lane.place === place);
  if (!from || !to || from.place === place) return null;
  return {
    places: { [id]: place },
    order: {
      [from.place]: idsIn(from).filter((other) => other !== id),
      [place]: [...idsIn(to), id],
    },
  };
}
