import type { ControlContribution, Observable } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import { createWriter } from "../src/model/queue.ts";
import {
  createPresets,
  MAX_NAME,
  MAX_PRESETS,
  PresetError,
} from "../src/presets/presets.ts";
import { act } from "./act.ts";
import { effect, fakeStore, testMixer } from "./context.ts";

const reverb = effect("reverb", "send");
const eq = effect("eq", "pre-gate");

function setup(initial?: Readonly<Record<string, unknown>>) {
  const mixer = testMixer({
    effects: [eq, reverb],
    local: { audioEffectMix: { reverb: 0.3 } },
  });
  const stored = fakeStore(initial);
  let next = 0;
  const presets = createPresets({
    api: mixer.api,
    store: stored.store,
    writes: createWriter((error) => mixer.errors.push(error)),
    newId: () => {
      next += 1;
      return `id${String(next)}`;
    },
  });
  return { ...mixer, ...stored, presets };
}

describe("presets", () => {
  it("saves what the channel is now, as one JSON string per preset", async () => {
    // Arrange
    const { presets, saved } = setup();

    // Act
    await presets.saveAs("  Cave  ");

    // Assert
    const json = saved().id1;
    expect(typeof json).toBe("string");
    expect(JSON.parse(json as string)).toMatchObject({
      name: "Cave",
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
    });
    expect(presets.active()?.name).toBe("Cave");
  });

  it("replaces a preset of the same name, keeping its place", async () => {
    // Arrange
    const { presets, saved, setLocal } = setup();
    await presets.saveAs("Cave");
    await setLocal({ chosenEffects: ["reverb"] });

    // Act
    await presets.saveAs("cave");

    // Assert
    expect(Object.keys(saved())).toEqual(["id1"]);
    expect(presets.list()[0]?.effects.reverb?.on).toBe(true);
  });

  it.each([
    ["empty", "   ", "empty-name"],
    ["too long", "x".repeat(MAX_NAME + 1), "long-name"],
  ])("refuses a name that is %s", async (_, name, reason) => {
    const { presets } = setup();

    await expect(presets.saveAs(name)).rejects.toMatchObject({ reason });
  });

  it("has a limit, but a known name can still be saved at it", async () => {
    // Arrange
    const full = Object.fromEntries(
      Array.from({ length: MAX_PRESETS }, (_, i) => [
        `p${String(i)}`,
        JSON.stringify({ name: `P${String(i)}`, effects: {} }),
      ]),
    );
    const { presets } = setup(full);

    // Act, Assert
    await expect(presets.saveAs("One more")).rejects.toBeInstanceOf(
      PresetError,
    );
    await expect(presets.saveAs("P3")).resolves.toBeDefined();
  });

  it("lists by name, passing over what doesn't read as a preset", () => {
    const { presets } = setup({
      b: JSON.stringify({ name: "Zed", effects: {} }),
      a: JSON.stringify({ name: "alpha", effects: {} }),
      bad: "not json",
      odd: JSON.stringify({ name: 7, effects: {} }),
      also: 12,
      nameless: JSON.stringify({ effects: {} }),
    });

    expect(presets.list().map((p) => p.name)).toEqual(["alpha", "Zed"]);
  });

  it("applies in the safe order: off, the one pipeline write, settings, on", async () => {
    // Arrange
    const set = vi.fn(() => Promise.resolve());
    const state: Observable<number> = {
      get: () => 1,
      subscribe: () => () => undefined,
    };
    const decay: ControlContribution = {
      kind: "control",
      place: "quick",
      effect: "reverb",
      type: "range",
      id: "decay",
      label: "Decay",
      min: 0,
      max: 3,
      step: 0.1,
      state,
      set,
    };
    const { api, presets } = setup({
      id: JSON.stringify({
        name: "Cave",
        effects: {
          eq: { on: false, place: "pre-gate" },
          reverb: { on: true, place: "send", mix: 0.7, settings: { decay: 2 } },
        },
      }),
    });
    api.contributions.register(decay);
    api.setState((s) => ({
      ...s,
      local: { ...s.local, chosenEffects: ["eq"] },
    }));

    // Act
    await presets.apply("id");

    // Assert
    expect(api.calls).toEqual([
      { command: "setEffectEnabled", args: ["eq", false] },
      {
        command: "setAudioPipeline",
        args: [
          {
            places: { eq: "pre-gate", reverb: "send" },
            mix: { reverb: 0.7 },
          },
        ],
      },
      { command: "setEffectEnabled", args: ["reverb", true] },
    ]);
    expect(set).toHaveBeenCalledWith(2);
    expect(presets.active()?.name).toBe("Cave");
  });

  it("writes nothing to the pipeline when there is nothing to change", async () => {
    const { api, presets } = setup({
      id: JSON.stringify({ name: "Empty", effects: {} }),
    });

    await presets.apply("id");

    expect(api.calls).toEqual([]);
  });

  it("never rewrites the preset it applies", async () => {
    // Arrange
    const json = JSON.stringify({
      name: "Krisp",
      effects: { krisp: { on: true, place: "pre-gate" } },
    });
    const { presets, saved } = setup({ id: json });

    // Act
    await presets.apply("id");

    // Assert
    expect(saved().id).toBe(json);
    expect(presets.skipped()).toEqual({ missing: ["krisp"], unsupported: [] });
  });

  it("lands on the last of fast switching", async () => {
    // Arrange
    const preset = (name: string, level: number) =>
      JSON.stringify({ name, effects: {}, channelLevel: level });
    const { api, presets } = setup({
      a: preset("A", 0.1),
      b: preset("B", 0.2),
      c: preset("C", 0.3),
    });

    // Act
    await Promise.all([
      presets.apply("a"),
      presets.apply("b"),
      presets.apply("c"),
    ]);

    // Assert
    expect(api.calls.at(-1)?.args).toEqual([{ channelLevel: 0.3 }]);
    expect(api.calls).toHaveLength(2);
    expect(presets.active()?.name).toBe("C");
  });

  it("does nothing for a preset that doesn't exist", async () => {
    const { api, presets } = setup();

    await presets.apply("nope");

    expect(api.calls).toEqual([]);
  });

  it("marks the active preset changed once the channel moves off it", async () => {
    // Arrange
    const { presets, setLocal } = setup();
    await presets.saveAs("Cave");
    expect(presets.changed()).toBe(false);

    // Act
    await setLocal({ audioChannelLevel: 0.5 });

    // Assert
    expect(presets.changed()).toBe(true);
  });

  it("isn't changed with no preset active", () => {
    expect(setup().presets.changed()).toBe(false);
  });

  it("deletes one, and stops calling it active", async () => {
    // Arrange
    const { presets, saved } = setup();
    await presets.saveAs("Cave");

    // Act
    await presets.remove("id1");

    // Assert
    expect(saved()).toEqual({});
    expect(presets.active()).toBeNull();
  });

  it("steps through by name, wrapping, for the keybindings", async () => {
    // Arrange
    const preset = (name: string) => JSON.stringify({ name, effects: {} });
    const { presets } = setup({ a: preset("A"), b: preset("B") });

    // Act, Assert
    await presets.step(1);
    expect(presets.active()?.name).toBe("A");
    await presets.step(1);
    expect(presets.active()?.name).toBe("B");
    await presets.step(1);
    expect(presets.active()?.name).toBe("A");
    await presets.step(-1);
    expect(presets.active()?.name).toBe("B");
  });

  it("has nothing to step through without presets", async () => {
    const { presets } = setup();

    await expect(presets.step(1)).resolves.toBeNull();
  });

  it("tells who listens, until they stop", async () => {
    // Arrange
    const { presets } = setup();
    const listener = vi.fn();
    const off = presets.subscribe(listener);

    // Act
    await presets.saveAs("A");
    await act();
    const seen = listener.mock.calls.length;
    off();
    await presets.saveAs("B");

    // Assert
    expect(seen).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(seen);
  });
});
