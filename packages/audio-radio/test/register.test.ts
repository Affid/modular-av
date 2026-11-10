import type {
  AudioEffectContext,
  AudioEffectDefinition,
  AudioEffectKernel,
  Contribution,
  HostedAudioEffect,
  ModularAV,
  RangeControl,
} from "@modular-av/api";
import type { StoredSettings } from "@modular-av/kit";
import { describe, expect, it, vi } from "vitest";
import { MODULE_ID, registerRadio } from "../src/register.ts";
import { registerSettings } from "../src/settings.ts";

function fakeSettings(): StoredSettings {
  const values = new Map<string, unknown>();
  const changes = new Map<string, () => void>();
  return {
    register(_module, key, config) {
      values.set(key, config.default);
      changes.set(key, config.onChange as () => void);
    },
    get: (_module, key) => values.get(key),
    set(_module, key, value) {
      values.set(key, value);
      changes.get(key)?.();
      return Promise.resolve();
    },
  };
}

function setup() {
  const settings = registerSettings(fakeSettings());
  let definition: AudioEffectDefinition | undefined;
  const contributions: Contribution[] = [];
  const api = {
    effects: {
      register: (d: AudioEffectDefinition) => {
        definition = d;
      },
    },
    contributions: {
      register: (c: Contribution) => {
        contributions.push(c);
        return () => undefined;
      },
    },
    assetUrl: (module: string, path: string) => `/modules/${module}/${path}`,
  } as unknown as Pick<ModularAV, "effects" | "contributions" | "assetUrl">;
  registerRadio(api, settings);
  if (!definition) throw new Error("not registered");
  const control = (id: string): RangeControl => {
    const found = contributions.find(
      (c) => "id" in c && c.id === `${MODULE_ID}.${id}`,
    );
    if (!found) throw new Error(`no control ${id}`);
    return found as unknown as RangeControl;
  };
  return { definition, control };
}

function createEffect(definition: AudioEffectDefinition) {
  const configure = vi.fn();
  const dispose = vi.fn();
  const kernels: AudioEffectKernel[] = [];
  const hosted = {
    input: {},
    output: {},
    configure,
    dispose,
  } as unknown as HostedAudioEffect;
  const context = {
    host: (kernel: AudioEffectKernel) => {
      kernels.push(kernel);
      return Promise.resolve(hosted);
    },
  } as unknown as AudioEffectContext;
  return { effect: definition.create(context), configure, dispose, kernels };
}

describe("the radio", () => {
  it("declares what the routing depends on", () => {
    const { definition } = setup();

    expect(definition).toMatchObject({
      id: "radio",
      kind: "audio",
      defaultPlace: "post-gate",
      tail: 0.3,
      cost: "light",
    });
    expect(definition.latency).toBeUndefined();
    expect(definition.defaultMix).toBeUndefined();
  });

  it("starts its kernel with what is saved", async () => {
    // Arrange
    const { definition, control } = setup();
    await control("drive").set(80);
    await control("static").set(0);
    await control("squelch").set(25);

    // Act
    const { effect, kernels } = createEffect(definition);
    await effect;

    // Assert
    expect(kernels).toEqual([
      {
        module: `/modules/${MODULE_ID}/worklets/radio.js`,
        name: MODULE_ID,
        options: { drive: 0.8, static: 0, squelch: 0.25 },
      },
    ]);
  });

  it("tells a running kernel of a change, until it is disposed", async () => {
    // Arrange
    const { definition, control } = setup();
    const { effect, configure, dispose } = createEffect(definition);
    const running = await effect;

    // Act
    await control("static").set(60);
    running.dispose();
    await control("squelch").set(0);

    // Assert
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith({
      drive: 0.5,
      static: 0.6,
      squelch: 0.5,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["drive", 50],
    ["static", 30],
    ["squelch", 50],
  ])("offers %s with the effect, in percent", (id, starts) => {
    const { control } = setup();

    expect(control(id)).toMatchObject({
      kind: "control",
      effect: "radio",
      type: "range",
      min: 0,
      max: 100,
      unit: "%",
    });
    expect(control(id).state.get()).toBe(starts);
  });

  it("tells a UI of a change in percent", async () => {
    // Arrange
    const { control } = setup();
    const heard: number[] = [];
    control("drive").state.subscribe((value) => heard.push(value));

    // Act
    await control("drive").set(35);

    // Assert
    expect(heard).toEqual([35]);
  });

  it("needs a secure context with AudioWorklet", () => {
    const { definition } = setup();

    expect(definition.isSupported()).toBe(false);
  });
});
