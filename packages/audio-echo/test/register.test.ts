import type {
  AudioEffectContext,
  AudioEffectDefinition,
  AudioEffectKernel,
  Contribution,
  HostedAudioEffect,
  ModularAV,
  RangeControl,
} from "@modular-av/api";
import type { SettingsApi } from "@modular-av/kit";
import { describe, expect, it, vi } from "vitest";
import { MODULE_ID, registerEcho } from "../src/register.ts";
import { registerSettings } from "../src/settings.ts";

function fakeSettings(): SettingsApi {
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
      return Promise.resolve(value);
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
  registerEcho(api, settings);
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

describe("the echo", () => {
  it("declares what the routing depends on", () => {
    const { definition } = setup();

    expect(definition).toMatchObject({
      id: "echo",
      kind: "audio",
      defaultPlace: "send",
      tail: 3,
      defaultMix: 0.35,
      cost: "light",
    });
  });

  it("starts its kernel with what is saved", async () => {
    // Arrange
    const { definition, control } = setup();
    await control("time").set(200);
    await control("decay").set(2);

    // Act
    const { effect, kernels } = createEffect(definition);
    await effect;

    // Assert
    expect(kernels).toEqual([
      {
        module: `/modules/${MODULE_ID}/worklets/echo.js`,
        name: MODULE_ID,
        options: { time: 0.2, decay: 2 },
      },
    ]);
  });

  it("tells a running kernel of a change, until it is disposed", async () => {
    // Arrange
    const { definition, control } = setup();
    const { effect, configure, dispose } = createEffect(definition);
    const running = await effect;

    // Act
    await control("decay").set(2.5);
    running.dispose();
    await control("decay").set(1);

    // Assert
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith({ time: 0.3, decay: 2.5 });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("offers its settings with the effect, and the core's way of reading them", () => {
    const { control } = setup();

    expect(control("time")).toMatchObject({
      kind: "control",
      effect: "echo",
      type: "range",
      min: 50,
      max: 600,
      unit: "ms",
    });
    expect(control("time").state.get()).toBe(300);
    expect(control("decay")).toMatchObject({
      effect: "echo",
      min: 0.3,
      max: 3,
      unit: "s",
    });
    expect(control("decay").state.get()).toBe(1.5);
  });

  it("needs a secure context with AudioWorklet", () => {
    const { definition } = setup();

    expect(definition.isSupported()).toBe(false);
  });
});
