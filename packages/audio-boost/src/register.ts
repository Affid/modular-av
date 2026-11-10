import type {
  AudioEffect,
  AudioEffectContext,
  AudioEffectDefinition,
  ControlContribution,
  ModularAV,
  Observable,
  RangeControl,
} from "@modular-av/api";
import type { NumberSetting } from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";
import { BOOST_DB, type BoostSettings } from "./settings.ts";

export { MODULE_ID };

const EFFECT_ID = "boost";
/** How long a change takes to land, so a slider doesn't click. */
const EASE_S = 0.02;

/** A hard knee just under full scale: the boost can't clip what goes out. */
const LIMITER = {
  threshold: -2,
  knee: 0,
  ratio: 20,
  attack: 0.001,
  release: 0.1,
} as const;

export interface CompressorShape {
  readonly threshold: number;
  readonly knee: number;
  readonly ratio: number;
  readonly attack: number;
  readonly release: number;
}

/**
 * From 0 (no compression) to 1 (peaks above -40 dBFS brought down 8:1).
 * The browser adds make-up gain as it compresses, so evening out also
 * raises the quiet parts.
 */
export function compressorFor(evenness: number): CompressorShape {
  return {
    threshold: -10 - 30 * evenness,
    knee: 10,
    ratio: 1 + 7 * evenness,
    attack: 0.005,
    release: 0.2,
  };
}

const linear = (db: number): number => 10 ** (db / 20);

type Api = Pick<ModularAV, "effects" | "contributions">;

const percent = (source: Observable<number>): Observable<number> => ({
  get: () => Math.round(source.get() * 100),
  subscribe: (listener) =>
    source.subscribe((value) => {
      listener(Math.round(value * 100));
    }),
});

const control = (
  id: keyof BoostSettings,
  range: Pick<RangeControl, "min" | "max" | "step" | "unit" | "state">,
  set: (value: number) => Promise<void>,
): RangeControl & ControlContribution => ({
  ...{ kind: "control", place: "quick", effect: EFFECT_ID, type: "range" },
  ...{ id: `${MODULE_ID}.${id}`, label: `${MODULE_ID}.controls.${id}` },
  ...range,
  set,
});

function controls(settings: BoostSettings): readonly ControlContribution[] {
  const { boost, evenness } = settings;
  return [
    control(
      "boost",
      {
        min: BOOST_DB.min,
        max: BOOST_DB.max,
        step: 1,
        unit: "dB",
        state: boost,
      },
      (value) => boost.set(value),
    ),
    control(
      "evenness",
      { min: 0, max: 100, step: 5, unit: "%", state: percent(evenness) },
      (value) => evenness.set(value / 100),
    ),
  ];
}

function shape(
  node: DynamicsCompressorNode,
  to: CompressorShape,
  at: number | null,
): void {
  for (const key of [
    "threshold",
    "knee",
    "ratio",
    "attack",
    "release",
  ] as const)
    if (at === null) node[key].value = to[key];
    else node[key].setTargetAtTime(to[key], at, EASE_S);
}

/** Calls `apply` with each new value of `setting` while the effect runs. */
const follow = (
  setting: NumberSetting,
  apply: (value: number) => void,
): (() => void) => setting.subscribe(apply);

function createBoost(
  { audioContext }: AudioEffectContext,
  settings: BoostSettings,
): AudioEffect {
  const gain = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  const limiter = audioContext.createDynamicsCompressor();
  gain.gain.value = linear(settings.boost.get());
  shape(compressor, compressorFor(settings.evenness.get()), null);
  shape(limiter, LIMITER, null);
  gain.connect(compressor);
  compressor.connect(limiter);
  const stops = [
    follow(settings.boost, (db) => {
      gain.gain.setTargetAtTime(linear(db), audioContext.currentTime, EASE_S);
    }),
    follow(settings.evenness, (value) => {
      shape(compressor, compressorFor(value), audioContext.currentTime);
    }),
  ];
  return {
    input: gain,
    output: limiter,
    dispose() {
      for (const stop of stops) stop();
      for (const node of [gain, compressor, limiter]) node.disconnect();
    },
  };
}

export function registerBoost(api: Api, settings: BoostSettings): void {
  const definition: AudioEffectDefinition = {
    id: EFFECT_ID,
    kind: "audio",
    label: `${MODULE_ID}.label`,
    defaultPlace: "pre-gate",
    cost: "light",
    isSupported: () => true,
    create: (context) => Promise.resolve(createBoost(context, settings)),
  };
  api.effects.register(definition);
  for (const c of controls(settings)) api.contributions.register(c);
}
