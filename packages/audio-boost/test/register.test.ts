import type {
  AudioEffectContext,
  AudioEffectDefinition,
  Contribution,
  ModularAV,
  RangeControl,
} from "@modular-av/api";
import type { StoredSettings } from "@modular-av/kit";
import { describe, expect, it, vi } from "vitest";
import { compressorFor, MODULE_ID, registerBoost } from "../src/register.ts";
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

const param = (value = 0) => ({ value, setTargetAtTime: vi.fn() });

function fakeNode(kind: "gain" | "compressor") {
  return {
    kind,
    gain: param(1),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    connect: vi.fn((next: unknown) => next),
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
  registerBoost(api, settings);
  if (!definition) throw new Error("not registered");
  const control = (id: string): RangeControl => {
    const found = contributions.find(
      (c) => "id" in c && c.id === `${MODULE_ID}.${id}`,
    );
    if (!found) throw new Error(`no control ${id}`);
    return found as unknown as RangeControl;
  };
  const nodes: ReturnType<typeof fakeNode>[] = [];
  const context = {
    audioContext: {
      currentTime: 5,
      createGain() {
        const node = fakeNode("gain");
        nodes.push(node);
        return node;
      },
      createDynamicsCompressor() {
        const node = fakeNode("compressor");
        nodes.push(node);
        return node;
      },
    },
  } as unknown as AudioEffectContext;
  return { definition, control, nodes, context };
}

describe("the mic boost", () => {
  it("declares what the routing depends on", () => {
    const { definition } = setup();

    expect(definition).toMatchObject({
      id: "boost",
      kind: "audio",
      defaultPlace: "pre-gate",
      cost: "light",
    });
    expect(definition.tail).toBeUndefined();
    expect(definition.isSupported()).toBe(true);
  });

  it("chains the boost, a compressor and a limiter, at what is saved", async () => {
    // Arrange
    const { definition, control, nodes, context } = setup();
    await control("boost").set(12);
    await control("evenness").set(100);

    // Act
    const effect = await definition.create(context);

    // Assert
    const [gain, compressor, limiter] = nodes;
    expect(nodes.map((n) => n.kind)).toEqual([
      "gain",
      "compressor",
      "compressor",
    ]);
    expect(gain?.gain.value).toBeCloseTo(10 ** (12 / 20));
    expect(compressor?.threshold.value).toBe(compressorFor(1).threshold);
    expect(limiter?.ratio.value).toBe(20);
    expect(gain?.connect).toHaveBeenCalledWith(compressor);
    expect(compressor?.connect).toHaveBeenCalledWith(limiter);
    expect([effect.input, effect.output]).toEqual([gain, limiter]);
  });

  it("eases a running boost to a change, until it is disposed", async () => {
    // Arrange
    const { definition, control, nodes, context } = setup();
    const effect = await definition.create(context);
    const boost = nodes[0]?.gain.setTargetAtTime;
    const threshold = nodes[1]?.threshold.setTargetAtTime;

    // Act
    await control("boost").set(20);
    await control("evenness").set(0);
    effect.dispose();
    await control("boost").set(1);

    // Assert
    expect(boost).toHaveBeenCalledTimes(1);
    expect(boost).toHaveBeenCalledWith(10, 5, expect.any(Number));
    expect(threshold).toHaveBeenCalledWith(
      compressorFor(0).threshold,
      5,
      expect.any(Number),
    );
    for (const node of nodes) expect(node.disconnect).toHaveBeenCalledTimes(1);
  });

  it("compresses harder the more it evens out", () => {
    const [none, half, full] = [0, 0.5, 1].map(compressorFor);

    expect(none?.ratio).toBe(1);
    expect(half?.threshold).toBeLessThan(none?.threshold ?? 0);
    expect(full?.threshold).toBeLessThan(half?.threshold ?? 0);
    expect(full?.ratio).toBeGreaterThan(half?.ratio ?? 0);
  });

  it("offers a boost in dB and evening out in %, with the effect", () => {
    const { control } = setup();

    expect(control("boost")).toMatchObject({
      ...{ kind: "control", effect: "boost", type: "range" },
      ...{ min: 0, max: 24, unit: "dB" },
    });
    expect(control("boost").state.get()).toBe(6);
    expect(control("evenness")).toMatchObject({
      ...{ effect: "boost", min: 0, max: 100, unit: "%" },
    });
    expect(control("evenness").state.get()).toBe(50);
  });
});
