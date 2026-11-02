import { describe, expect, it } from "vitest";
import {
  type Layer,
  layerFromSnapshot,
  mergeLayers,
  parseLayer,
  parseUndo,
  reconcileStep,
  splitHeld,
  underneath,
} from "../src/layers/layer.ts";
import type { Snapshot } from "../src/model/snapshot.ts";
import { effect } from "./context.ts";

const cave: Layer = {
  id: "cave",
  label: "Cave",
  includeGMs: false,
  effects: { reverb: { on: true, place: "send", mix: 0.6 } },
};

const orc: Layer = {
  id: "orc",
  label: "Orc",
  includeGMs: false,
  effects: {
    reverb: { mix: 0.2 },
    radio: { on: true },
  },
  channelLevel: 0.5,
};

const current: Snapshot = {
  effects: {
    reverb: { on: false, place: "send", mix: 0.3, settings: { decay: 1 } },
    radio: { on: false, place: "post-gate" },
    eq: { on: true, place: "pre-gate" },
  },
  order: { send: ["reverb"], "pre-gate": ["eq"] },
  channelLevel: 1,
};

describe("a layer as stored", () => {
  const stored = JSON.stringify(cave);

  it("reads back", () => {
    expect(parseLayer(stored)).toEqual(cave);
  });

  it("needs an id and a label", () => {
    expect(parseLayer(JSON.stringify({ effects: {} }))).toBeNull();
    expect(parseLayer(JSON.stringify({ id: "a", effects: {} }))).toBeNull();
  });

  it("bounds its label", () => {
    const long = { ...cave, label: "x".repeat(200) };

    expect(parseLayer(JSON.stringify(long))).toBeNull();
  });

  it("reads no layer in nothing, or in what isn't one", () => {
    expect(parseLayer("")).toBeNull();
    expect(parseLayer(null)).toBeNull();
    expect(parseLayer("not json")).toBeNull();
  });

  it("carries nothing a layer can never change", () => {
    const sneaky = { ...cave, voiceMode: "always", devices: { a: 1 } };

    expect(parseLayer(JSON.stringify(sneaky))).toEqual(cave);
  });
});

describe("turning a saved preset into a layer", () => {
  const definitions = [
    effect("reverb", "send"),
    effect("eq", "pre-gate"),
    effect("rnnoise", "pre-gate", { exclusiveGroup: "noise-suppression" }),
  ];

  it("takes only what is on, and leaves noise suppression to each player", () => {
    const layer = layerFromSnapshot(
      {
        effects: {
          reverb: { on: true, place: "send", mix: 0.6 },
          eq: { on: false, place: "pre-gate" },
          rnnoise: { on: true, place: "pre-gate" },
        },
        order: { send: ["reverb"] },
        channelLevel: 1,
      },
      definitions,
      { id: "cave", label: "Cave", includeGMs: true },
    );

    expect(layer).toEqual({
      id: "cave",
      label: "Cave",
      includeGMs: true,
      effects: { reverb: { on: true, place: "send", mix: 0.6 } },
    });
  });

  it("carries Channel level when it isn't full", () => {
    const layer = layerFromSnapshot(
      { effects: {}, channelLevel: 0.4 },
      definitions,
      { id: "a", label: "A", includeGMs: false },
    );

    expect(layer.channelLevel).toBe(0.4);
  });
});

describe("two layers at once", () => {
  it("have the personal one override the table's, key by key", () => {
    const merged = mergeLayers([cave, orc]);

    expect(merged?.effects.reverb).toEqual({
      on: true,
      place: "send",
      mix: 0.2,
    });
    expect(merged?.effects.radio).toEqual({ on: true });
    expect(merged?.channelLevel).toBe(0.5);
  });

  it("merge settings too", () => {
    const first: Layer = {
      ...cave,
      effects: { reverb: { settings: { decay: 2, wide: true } } },
    };
    const second: Layer = {
      ...orc,
      effects: { reverb: { settings: { decay: 3 } } },
    };

    expect(mergeLayers([first, second])?.effects.reverb?.settings).toEqual({
      decay: 3,
      wide: true,
    });
  });

  it("are nothing when there are none", () => {
    expect(mergeLayers([])).toBeNull();
  });
});

describe("a step of reconciling", () => {
  it("does nothing with no layer and no record", () => {
    expect(reconcileStep(null, null, current)).toBeNull();
  });

  it("remembers only what the layer takes over", () => {
    const step = reconcileStep(mergeLayers([cave]), null, current);

    expect(step?.undo).toEqual({
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
    });
    expect(step?.target).toEqual({
      effects: { reverb: { on: true, place: "send", mix: 0.6 } },
    });
  });

  it("remembers what a setting, an order and Channel level held", () => {
    const layer: Layer = {
      ...cave,
      effects: { reverb: { settings: { decay: 3 } } },
      order: { send: ["reverb"] },
      channelLevel: 0.4,
    };

    expect(reconcileStep(mergeLayers([layer]), null, current)?.undo).toEqual({
      effects: { reverb: { settings: { decay: 1 } } },
      order: { send: ["reverb"] },
      channelLevel: 1,
    });
  });

  it("is repeatable: a reload mid-cave lands in the same place", () => {
    // Arrange: the cave has applied.
    const merged = mergeLayers([cave]);
    const first = reconcileStep(merged, null, current);
    const during: Snapshot = {
      ...current,
      effects: {
        ...current.effects,
        reverb: { on: true, place: "send", mix: 0.6 },
      },
    };

    // Act
    const again = reconcileStep(merged, first?.undo ?? null, during);

    // Assert
    expect(again?.undo).toEqual(first?.undo);
    expect(again?.target).toEqual(first?.target);
  });

  it("gives back everything when the layer ends", () => {
    const undo = {
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
    } as const;

    const step = reconcileStep(null, undo, current);

    expect(step?.target).toEqual(undo);
    expect(step?.undo).toBeNull();
  });

  it("gives back only what a changed layer lets go of", () => {
    // Arrange: the table held the reverb; now it holds Channel level instead.
    const undo: Snapshot = {
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
    };
    const next: Layer = { ...cave, id: "next", effects: {}, channelLevel: 0.5 };

    // Act
    const step = reconcileStep(mergeLayers([next]), undo, current);

    // Assert
    expect(step?.target).toEqual({
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
      channelLevel: 0.5,
    });
    expect(step?.undo).toEqual({ effects: {}, channelLevel: 1 });
  });

  it("keeps what is still to give back while a change is applied", () => {
    const undo: Snapshot = {
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
    };
    const next: Layer = { ...cave, effects: {}, channelLevel: 0.5 };

    const step = reconcileStep(mergeLayers([next]), undo, current);

    expect(step?.keep).toEqual({
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
      channelLevel: 1,
    });
  });

  it("doesn't take over an effect that isn't in this world", () => {
    const layer: Layer = { ...cave, effects: { krisp: { on: true } } };

    const step = reconcileStep(mergeLayers([layer]), null, current);

    expect(step?.undo).toEqual({ effects: {} });
    expect(step?.target.effects.krisp).toEqual({ on: true });
  });

  it("keeps a preset's value for a held key, for when the layer ends", () => {
    // Arrange
    const record: Snapshot = {
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
    };
    const preset: Snapshot = {
      effects: {
        reverb: { on: true, place: "post-gate", mix: 0.9 },
        eq: { on: false },
      },
      channelLevel: 0.7,
    };

    // Act
    const { free, undo } = splitHeld(preset, record);

    // Assert: what is held waits in the record, the rest applies at once.
    expect(free).toEqual({
      effects: { reverb: {}, eq: { on: false } },
      channelLevel: 0.7,
    });
    expect(undo.effects.reverb).toEqual({
      on: true,
      place: "post-gate",
      mix: 0.9,
    });
  });

  it("holds an order place and Channel level in the record too", () => {
    const record: Snapshot = {
      effects: {},
      order: { send: ["a"] },
      channelLevel: 1,
    };

    const { free, undo } = splitHeld(
      {
        effects: {},
        order: { send: ["b"], "pre-gate": ["c"] },
        channelLevel: 0.2,
      },
      record,
    );

    expect(free).toEqual({ effects: {}, order: { "pre-gate": ["c"] } });
    expect(undo).toEqual({
      effects: {},
      order: { send: ["b"] },
      channelLevel: 0.2,
    });
  });

  it("shows a preset saved mid-cave what lies under the layer", () => {
    const saved = underneath(
      {
        effects: { reverb: { on: true, place: "send", mix: 0.6 } },
        channelLevel: 0.5,
      },
      { effects: { reverb: { on: false, mix: 0.3 } }, channelLevel: 1 },
    );

    expect(saved).toEqual({
      effects: { reverb: { on: false, place: "send", mix: 0.3 } },
      channelLevel: 1,
    });
  });
});

describe("the undo record as stored", () => {
  it("reads back with the layers it was for", () => {
    const record = { ids: ["cave"], values: { effects: {} } };

    expect(parseUndo(JSON.stringify(record))).toEqual(record);
  });

  it.each([
    ["nothing", ""],
    ["not JSON", "{"],
    ["no ids", JSON.stringify({ values: { effects: {} } })],
    ["bad values", JSON.stringify({ ids: [], values: 3 })],
  ])("reads no record in %s", (_, stored) => {
    expect(parseUndo(stored)).toBeNull();
  });
});
