import type {
  AudioEffectContext,
  AudioEffectDefinition,
  Contribution,
  ModularAV,
  RangeControl,
} from "@modular-av/api";
import type { SettingsApi } from "@modular-av/kit";
import { describe, expect, it, vi } from "vitest";
import { MODULE_ID, registerEq } from "../src/register.ts";
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

function fakeFilter() {
  return {
    type: "",
    Q: { value: 1 },
    frequency: { value: 0 },
    gain: { value: 0, setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
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
  } as unknown as Pick<ModularAV, "effects" | "contributions">;
  registerEq(api, settings);
  if (!definition) throw new Error("not registered");
  const control = (id: string): RangeControl => {
    const found = contributions.find(
      (c) => "id" in c && c.id === `${MODULE_ID}.${id}`,
    );
    if (!found) throw new Error(`no control ${id}`);
    return found as unknown as RangeControl;
  };
  const filters: ReturnType<typeof fakeFilter>[] = [];
  const context = {
    audioContext: {
      currentTime: 5,
      createBiquadFilter() {
        const filter = fakeFilter();
        filters.push(filter);
        return filter;
      },
    },
  } as unknown as AudioEffectContext;
  return { definition, control, filters, context };
}

describe("the EQ", () => {
  it("declares what the routing depends on", () => {
    const { definition } = setup();

    expect(definition).toMatchObject({
      id: "eq",
      kind: "audio",
      defaultPlace: "pre-gate",
      cost: "light",
    });
    expect(definition.tail).toBeUndefined();
    expect(definition.isSupported()).toBe(true);
  });

  it("chains a low shelf, a peak and a high shelf, at what is saved", async () => {
    // Arrange
    const { definition, control, filters, context } = setup();
    await control("low").set(3);
    await control("mid").set(-2);
    await control("high").set(6);

    // Act
    const effect = await definition.create(context);

    // Assert
    expect(filters.map((f) => f.type)).toEqual([
      "lowshelf",
      "peaking",
      "highshelf",
    ]);
    expect(filters.map((f) => f.gain.value)).toEqual([3, -2, 6]);
    expect(filters[0]?.connect).toHaveBeenCalledWith(filters[1]);
    expect(filters[1]?.connect).toHaveBeenCalledWith(filters[2]);
    expect(effect.input).toBe(filters[0]);
    expect(effect.output).toBe(filters[2]);
  });

  it("eases a running band to a change, until it is disposed", async () => {
    // Arrange
    const { definition, control, filters, context } = setup();
    const effect = await definition.create(context);
    const low = filters[0]?.gain.setTargetAtTime;

    // Act
    await control("low").set(6);
    effect.dispose();
    await control("low").set(1);

    // Assert
    expect(low).toHaveBeenCalledTimes(1);
    expect(low).toHaveBeenCalledWith(6, 5, expect.any(Number));
    for (const filter of filters)
      expect(filter.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(["low", "mid", "high"])("offers %s with the effect", (id) => {
    const { control } = setup();

    expect(control(id)).toMatchObject({
      kind: "control",
      effect: "eq",
      type: "range",
      min: -12,
      max: 12,
      unit: "dB",
    });
    expect(control(id).state.get()).toBe(0);
  });
});
