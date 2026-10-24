import type {
  AudioEffect,
  AudioEffectContext,
  AudioEffectDefinition,
  AudioStage,
  EffectContext,
  VideoEffect,
  VideoEffectDefinition,
} from "@modular-av/api";
import { createFakeTrack } from "../service/fake-track.ts";

export interface FakeEffectOptions {
  readonly supported?: boolean;
  /** `create()` rejects with this. */
  readonly fail?: Error;
  readonly exclusiveGroup?: string;
}

export interface FakeAudioEffectInstance extends AudioEffect {
  readonly disposed: boolean;
}

export interface FakeAudioEffect {
  readonly definition: AudioEffectDefinition;
  readonly instances: readonly FakeAudioEffectInstance[];
  readonly contexts: readonly AudioEffectContext[];
}

/** An audio effect made of one gain node of the capture context. */
export function createFakeAudioEffect(
  id: string,
  options: FakeEffectOptions & { readonly stage?: AudioStage } = {},
): FakeAudioEffect {
  let instances: readonly FakeAudioEffectInstance[] = [];
  let contexts: readonly AudioEffectContext[] = [];
  const definition: AudioEffectDefinition = {
    id,
    kind: "audio",
    label: id,
    stage: options.stage ?? "denoise",
    ...(options.exclusiveGroup
      ? { exclusiveGroup: options.exclusiveGroup }
      : {}),
    cost: "light",
    isSupported: () => options.supported ?? true,
    create(context) {
      contexts = [...contexts, context];
      if (options.fail) return Promise.reject(options.fail);
      const node = context.audioContext.createGain();
      let disposed = false;
      const instance: FakeAudioEffectInstance = {
        input: node,
        output: node,
        get disposed() {
          return disposed;
        },
        dispose() {
          disposed = true;
        },
      };
      instances = [...instances, instance];
      return Promise.resolve(instance);
    },
  };
  return {
    definition,
    get instances() {
      return instances;
    },
    get contexts() {
      return contexts;
    },
  };
}

export interface FakeVideoEffectInstance extends VideoEffect {
  /** The processed track `start()` resolves with. */
  readonly output: MediaStreamTrack;
  readonly inputs: readonly MediaStreamTrack[];
  readonly disposed: boolean;
}

export interface FakeVideoEffect {
  readonly definition: VideoEffectDefinition;
  readonly instances: readonly FakeVideoEffectInstance[];
  readonly contexts: readonly EffectContext[];
}

/**
 * A video effect whose `start()` resolves at once with its own track. Its
 * frames flow only when a test says so (`FakeMediaEnv.frame(output)`).
 */
export function createFakeVideoEffect(
  id: string,
  options: FakeEffectOptions = {},
): FakeVideoEffect {
  let instances: readonly FakeVideoEffectInstance[] = [];
  let contexts: readonly EffectContext[] = [];
  const definition: VideoEffectDefinition = {
    id,
    kind: "video",
    label: id,
    ...(options.exclusiveGroup
      ? { exclusiveGroup: options.exclusiveGroup }
      : {}),
    cost: "heavy",
    isSupported: () => options.supported ?? true,
    create(context) {
      contexts = [...contexts, context];
      if (options.fail) return Promise.reject(options.fail);
      const output = createFakeTrack("video", `${id} output`);
      let inputs: readonly MediaStreamTrack[] = [];
      let disposed = false;
      const instance: FakeVideoEffectInstance = {
        output,
        get inputs() {
          return inputs;
        },
        get disposed() {
          return disposed;
        },
        start(input) {
          inputs = [...inputs, input];
          return Promise.resolve(output);
        },
        replaceInput(input) {
          inputs = [...inputs, input];
          return Promise.resolve();
        },
        dispose() {
          disposed = true;
        },
      };
      instances = [...instances, instance];
      return Promise.resolve(instance);
    },
  };
  return {
    definition,
    get instances() {
      return instances;
    },
    get contexts() {
      return contexts;
    },
  };
}
