import type {
  AudioEffectDefinition,
  EffectDefinition,
  EffectStatus,
  LocalState,
} from "@modular-av/api";
import { audioEffectsOf, NOISE_SUPPRESSION } from "./pipeline.ts";

export type WarningKey =
  | "tail-before-gate"
  | "doubled-voice"
  | "noise-after-gate"
  | "channel-without-send"
  | "channel-zero-click";

export interface Warning {
  readonly key: WarningKey;
  /** The effect it is about; none for the channel itself. */
  readonly effect?: string;
}

/** Chosen, but can't carry the voice in this call or browser. */
const NOT_CARRYING: readonly EffectStatus[] = [
  "failed",
  "unsupported",
  "unavailable",
];

type Pipeline = Pick<
  LocalState,
  "chosenEffects" | "effects" | "audioEffectPlaces" | "audioChannelLevel"
>;

const placeOf = (d: AudioEffectDefinition, local: Pipeline) =>
  local.audioEffectPlaces[d.id] ?? d.defaultPlace;

function effectWarning(
  d: AudioEffectDefinition,
  local: Pipeline,
): Warning | null {
  const place = placeOf(d, local);
  const noise = d.exclusiveGroup === NOISE_SUPPRESSION;
  if (noise && place !== "pre-gate")
    return { key: "noise-after-gate", effect: d.id };
  if (place === "pre-gate" && (d.tail ?? 0) > 0)
    return { key: "tail-before-gate", effect: d.id };
  if (place === "send" && !d.tail && d.defaultPlace !== "send")
    return { key: "doubled-voice", effect: d.id };
  return null;
}

const carriesVoice = (d: AudioEffectDefinition, local: Pipeline): boolean => {
  const status = local.effects[d.id]?.status ?? "off";
  return placeOf(d, local) === "send" && !NOT_CARRYING.includes(status);
};

function channelWarning(
  chosen: readonly AudioEffectDefinition[],
  local: Pipeline,
  automationRate: boolean,
): Warning | null {
  if (local.audioChannelLevel >= 1) return null;
  if (!chosen.some((d) => carriesVoice(d, local)))
    return { key: "channel-without-send" };
  if (local.audioChannelLevel === 0 && !automationRate)
    return { key: "channel-zero-click" };
  return null;
}

/**
 * What sounds wrong about a setup, for chosen effects only. Warnings never
 * block anything: the core refuses nothing that merely sounds bad.
 */
export function warningsOf(
  definitions: readonly EffectDefinition[],
  local: Pipeline,
  automationRate: boolean,
): readonly Warning[] {
  const chosen = audioEffectsOf(definitions).filter((d) =>
    local.chosenEffects.includes(d.id),
  );
  const channel = channelWarning(chosen, local, automationRate);
  return [
    ...chosen.flatMap((d) => effectWarning(d, local) ?? []),
    ...(channel ? [channel] : []),
  ];
}
