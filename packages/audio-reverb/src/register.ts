import type {
  AudioEffectContext,
  AudioEffectDefinition,
  ControlContribution,
  HostedAudioEffect,
  ModularAV,
  Observable,
  RangeControl,
} from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import { DECAY, type ReverbSettings } from "./settings.ts";

export { MODULE_ID };

const EFFECT_ID = "reverb";
const KERNEL_FILE = "worklets/reverb.js";
/** The longest `DECAY` rings for, which the kernel guarantees. */
const TAIL_S = 3;
const DEFAULT_MIX = 0.3;

type Api = Pick<ModularAV, "effects" | "contributions" | "assetUrl">;

const snapshot = ({ decay, brightness }: ReverbSettings) => ({
  decay: decay.get(),
  brightness: brightness.get(),
});

const percent = (source: Observable<number>): Observable<number> => ({
  get: () => Math.round(source.get() * 100),
  subscribe: (listener) =>
    source.subscribe((value) => {
      listener(Math.round(value * 100));
    }),
});

function controls(
  settings: ReverbSettings,
): readonly (RangeControl & ControlContribution)[] {
  const attached = {
    kind: "control",
    place: "quick",
    effect: EFFECT_ID,
    type: "range",
  } as const;
  return [
    {
      ...attached,
      id: `${MODULE_ID}.decay`,
      label: `${MODULE_ID}.controls.decay`,
      min: DECAY.min,
      max: DECAY.max,
      step: 0.1,
      unit: "s",
      state: settings.decay,
      set: (value) => settings.decay.set(value),
    },
    {
      ...attached,
      id: `${MODULE_ID}.brightness`,
      label: `${MODULE_ID}.controls.brightness`,
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
      state: percent(settings.brightness),
      set: (value) => settings.brightness.set(value / 100),
    },
  ];
}

/** Follows the settings for as long as it runs. */
function following(
  effect: HostedAudioEffect,
  settings: ReverbSettings,
): HostedAudioEffect {
  const send = (): void => {
    effect.configure(snapshot(settings));
  };
  const stops = [
    settings.decay.subscribe(send),
    settings.brightness.subscribe(send),
  ];
  return {
    ...effect,
    dispose() {
      for (const stop of stops) stop();
      effect.dispose();
    },
  };
}

export function registerReverb(api: Api, settings: ReverbSettings): void {
  const definition: AudioEffectDefinition = {
    id: EFFECT_ID,
    kind: "audio",
    label: `${MODULE_ID}.label`,
    defaultPlace: "send",
    tail: TAIL_S,
    defaultMix: DEFAULT_MIX,
    cost: "medium",
    isSupported: () =>
      typeof AudioWorkletNode === "function" && isSecureContext,
    async create({ host }: AudioEffectContext) {
      const effect = await host({
        module: api.assetUrl(MODULE_ID, KERNEL_FILE),
        name: MODULE_ID,
        options: snapshot(settings),
      });
      return following(effect, settings);
    },
  };
  api.effects.register(definition);
  for (const control of controls(settings)) api.contributions.register(control);
}
