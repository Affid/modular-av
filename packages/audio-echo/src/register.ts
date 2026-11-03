import type {
  AudioEffectContext,
  AudioEffectDefinition,
  ControlContribution,
  HostedAudioEffect,
  ModularAV,
  RangeControl,
} from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import { DECAY, type EchoSettings, TIME } from "./settings.ts";

export { MODULE_ID };

const EFFECT_ID = "echo";
const KERNEL_FILE = "worklets/echo.js";
/** The longest `DECAY` rings for, which the kernel guarantees. */
const TAIL_S = 3;
const DEFAULT_MIX = 0.35;

type Api = Pick<ModularAV, "effects" | "contributions" | "assetUrl">;

const snapshot = ({ time, decay }: EchoSettings) => ({
  time: time.get() / 1000,
  decay: decay.get(),
});

function controls(
  settings: EchoSettings,
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
      id: `${MODULE_ID}.time`,
      label: `${MODULE_ID}.controls.time`,
      min: TIME.min,
      max: TIME.max,
      step: 10,
      unit: "ms",
      state: settings.time,
      set: (value) => settings.time.set(value),
    },
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
  ];
}

/** Follows the settings for as long as it runs. */
function following(
  effect: HostedAudioEffect,
  settings: EchoSettings,
): HostedAudioEffect {
  const send = (): void => {
    effect.configure(snapshot(settings));
  };
  const stops = [settings.time.subscribe(send), settings.decay.subscribe(send)];
  return {
    ...effect,
    dispose() {
      for (const stop of stops) stop();
      effect.dispose();
    },
  };
}

export function registerEcho(api: Api, settings: EchoSettings): void {
  const definition: AudioEffectDefinition = {
    id: EFFECT_ID,
    kind: "audio",
    label: `${MODULE_ID}.label`,
    defaultPlace: "send",
    tail: TAIL_S,
    defaultMix: DEFAULT_MIX,
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
  for (const control of controls(settings)) api.contributions.register(control);
}
