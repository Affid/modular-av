import type {
  AudioEffect,
  AudioEffectContext,
  AudioEffectDefinition,
  ControlContribution,
  ModularAV,
  RangeControl,
} from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import { type Band, BANDS, type EqSettings, GAIN } from "./settings.ts";

export { MODULE_ID };

const EFFECT_ID = "eq";
/** How long a band takes to reach a new gain, so a slider doesn't click. */
const EASE_S = 0.02;
const MID_Q = 0.7;

const SHAPES: Readonly<
  Record<Band, { readonly type: BiquadFilterType; readonly hz: number }>
> = {
  low: { type: "lowshelf", hz: 200 },
  mid: { type: "peaking", hz: 1000 },
  high: { type: "highshelf", hz: 4000 },
};

type Api = Pick<ModularAV, "effects" | "contributions">;

const control = (
  band: Band,
  settings: EqSettings,
): RangeControl & ControlContribution => ({
  kind: "control",
  place: "quick",
  effect: EFFECT_ID,
  type: "range",
  id: `${MODULE_ID}.${band}`,
  label: `${MODULE_ID}.controls.${band}`,
  min: GAIN.min,
  max: GAIN.max,
  step: 1,
  unit: "dB",
  state: settings[band],
  set: (value) => settings[band].set(value),
});

function createFilters(
  { audioContext }: AudioEffectContext,
  settings: EqSettings,
): AudioEffect {
  const stops: (() => void)[] = [];
  const filters = BANDS.map((band) => {
    const filter = audioContext.createBiquadFilter();
    filter.type = SHAPES[band].type;
    filter.frequency.value = SHAPES[band].hz;
    filter.Q.value = MID_Q;
    filter.gain.value = settings[band].get();
    stops.push(
      settings[band].subscribe((gain) => {
        filter.gain.setTargetAtTime(gain, audioContext.currentTime, EASE_S);
      }),
    );
    return filter;
  });
  const [low, mid, high] = filters;
  if (!low || !mid || !high) throw new Error("The EQ has three bands");
  low.connect(mid);
  mid.connect(high);
  return {
    input: low,
    output: high,
    dispose() {
      for (const stop of stops) stop();
      for (const filter of filters) filter.disconnect();
    },
  };
}

export function registerEq(api: Api, settings: EqSettings): void {
  const definition: AudioEffectDefinition = {
    id: EFFECT_ID,
    kind: "audio",
    label: `${MODULE_ID}.label`,
    defaultPlace: "pre-gate",
    cost: "light",
    isSupported: () => true,
    create: (context) => Promise.resolve(createFilters(context, settings)),
  };
  api.effects.register(definition);
  for (const band of BANDS) api.contributions.register(control(band, settings));
}
