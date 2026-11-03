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
import { type Knob, KNOBS, type RadioSettings } from "./settings.ts";

export { MODULE_ID };

const EFFECT_ID = "radio";
const KERNEL_FILE = "worklets/radio.js";
/** The squelch burst after a transmission ends, which the kernel guarantees. */
const TAIL_S = 0.3;

type Api = Pick<ModularAV, "effects" | "contributions" | "assetUrl">;

const snapshot = (settings: RadioSettings): Record<Knob, number> => ({
  drive: settings.drive.get(),
  static: settings.static.get(),
  squelch: settings.squelch.get(),
});

const percent = (source: Observable<number>): Observable<number> => ({
  get: () => Math.round(source.get() * 100),
  subscribe: (listener) =>
    source.subscribe((value) => {
      listener(Math.round(value * 100));
    }),
});

const control = (
  knob: Knob,
  settings: RadioSettings,
): RangeControl & ControlContribution => ({
  kind: "control",
  place: "quick",
  effect: EFFECT_ID,
  type: "range",
  id: `${MODULE_ID}.${knob}`,
  label: `${MODULE_ID}.controls.${knob}`,
  min: 0,
  max: 100,
  step: 5,
  unit: "%",
  state: percent(settings[knob]),
  set: (value) => settings[knob].set(value / 100),
});

/** Follows the settings for as long as it runs. */
function following(
  effect: HostedAudioEffect,
  settings: RadioSettings,
): HostedAudioEffect {
  const send = (): void => {
    effect.configure(snapshot(settings));
  };
  const stops = KNOBS.map((knob) => settings[knob].subscribe(send));
  return {
    ...effect,
    dispose() {
      for (const stop of stops) stop();
      effect.dispose();
    },
  };
}

export function registerRadio(api: Api, settings: RadioSettings): void {
  const definition: AudioEffectDefinition = {
    id: EFFECT_ID,
    kind: "audio",
    label: `${MODULE_ID}.label`,
    defaultPlace: "post-gate",
    tail: TAIL_S,
    cost: "light",
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
  for (const knob of KNOBS) api.contributions.register(control(knob, settings));
}
