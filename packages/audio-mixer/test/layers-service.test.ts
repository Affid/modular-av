import { describe, expect, it, vi } from "vitest";
import { createLayers, type LayerStore } from "../src/layers/layers.ts";
import { createGmLayers } from "../src/layers/gm-layers.ts";
import type { Layer } from "../src/layers/layer.ts";
import { createWriter } from "../src/model/queue.ts";
import { createPresets } from "../src/presets/presets.ts";
import { effect, fakeStore, testMixer } from "./context.ts";

const reverb = effect("reverb", "send", { tail: 3 });
const echo = effect("echo", "send");
const eq = effect("eq", "pre-gate");

const cave: Layer = {
  id: "cave",
  label: "Cave",
  includeGMs: false,
  effects: { reverb: { on: true, place: "send", mix: 0.6 } },
};

function fakeLayerStore(selfUndo = "") {
  const values = {
    table: "",
    personal: "",
    undo: selfUndo,
    refused: [] as readonly string[],
    keptOut: false,
  };
  const store: LayerStore = {
    table: () => values.table,
    personal: () => values.personal,
    undo: () => values.undo,
    setUndo(json) {
      values.undo = json;
      return Promise.resolve();
    },
    refused: () => values.refused,
    setRefused(ids) {
      values.refused = ids;
      return Promise.resolve();
    },
    keptOut: () => values.keptOut,
    setKeptOut(out) {
      values.keptOut = out;
      return Promise.resolve();
    },
  };
  return { store, values };
}

/** Commands act on the fake state, as the core's would. */
function setup(options: { selfIsGM?: boolean; undo?: string } = {}) {
  const mixer = testMixer({
    effects: [reverb, echo, eq],
    local: {
      chosenEffects: ["echo"],
      audioEffectMix: { reverb: 0.3, echo: 0.2 },
    },
  });
  const { api } = mixer;
  const real = api.commands;
  const update = (
    change: (
      l: typeof api extends never
        ? never
        : ReturnType<typeof api.state.get>["local"],
    ) => object,
  ) => {
    api.setState((s) => ({ ...s, local: { ...s.local, ...change(s.local) } }));
  };
  vi.spyOn(real, "setEffectEnabled").mockImplementation((id, on) => {
    update((l) => ({
      chosenEffects: on
        ? [...l.chosenEffects, id]
        : l.chosenEffects.filter((c) => c !== id),
    }));
    return Promise.resolve();
  });
  const pipeline = vi.spyOn(real, "setAudioPipeline");
  pipeline.mockImplementation((change) => {
    update((l) => ({
      audioEffectPlaces: { ...l.audioEffectPlaces, ...change.places },
      audioEffectMix: { ...l.audioEffectMix, ...change.mix },
      audioChannelLevel: change.channelLevel ?? l.audioChannelLevel,
    }));
    return Promise.resolve();
  });
  const { store, values } = fakeLayerStore(options.undo);
  const notified: string[] = [];
  const writes = createWriter((error) => mixer.errors.push(error));
  const layers = createLayers({
    api,
    store,
    writes,
    selfIsGM: options.selfIsGM ?? false,
    notify: (layer) => notified.push(layer.label),
  });
  const presets = createPresets({
    api,
    store: fakeStore().store,
    writes,
    newId: () => "p",
    layers,
  });
  const local = () => api.state.get().local;
  return { ...mixer, layers, presets, values, notified, local, pipeline };
}

describe("a layer on a player's client", () => {
  it("applies at once, with the old values saved first, and tells them", async () => {
    // Arrange
    const { layers, values, local, notified } = setup();
    values.table = JSON.stringify(cave);

    // Act
    await layers.reconcile();

    // Assert
    expect(local().chosenEffects).toContain("reverb");
    expect(local().audioEffectMix.reverb).toBe(0.6);
    expect(JSON.parse(values.undo)).toEqual({
      ids: ["cave"],
      values: { effects: { reverb: { on: false, place: "send", mix: 0.3 } } },
    });
    expect(notified).toEqual(["Cave"]);
  });

  it("does nothing, and writes nothing, with no layer", async () => {
    const { layers, values, api } = setup();

    await layers.reconcile();

    expect(values.undo).toBe("");
    expect(api.calls).toEqual([]);
  });

  it("gives everything back exactly when it ends", async () => {
    // Arrange
    const { layers, values, local } = setup();
    const before = local();
    values.table = JSON.stringify(cave);
    await layers.reconcile();

    // Act
    values.table = "";
    await layers.reconcile();

    // Assert
    expect(local().chosenEffects).toEqual(before.chosenEffects);
    expect(local().audioEffectMix).toEqual(before.audioEffectMix);
    expect(values.undo).toBe("");
  });

  it("leaves a player's own change to another key alone", async () => {
    // Arrange
    const { layers, values, local, api } = setup();
    values.table = JSON.stringify(cave);
    await layers.reconcile();

    // Act
    await api.commands.setEffectEnabled("eq", true);
    values.table = "";
    await layers.reconcile();

    // Assert
    expect(local().chosenEffects).toContain("eq");
  });

  it("replaces an effect the player already runs, and gives theirs back", async () => {
    // Arrange: the player's echo at 0.2; the layer's at 0.9.
    const { layers, values, local } = setup();
    const layer: Layer = {
      ...cave,
      effects: { echo: { on: true, place: "send", mix: 0.9 } },
    };
    values.table = JSON.stringify(layer);

    // Act, Assert
    await layers.reconcile();
    expect(local().audioEffectMix.echo).toBe(0.9);
    values.table = "";
    await layers.reconcile();
    expect(local().audioEffectMix.echo).toBe(0.2);
    expect(local().chosenEffects).toEqual(["echo"]);
  });

  it("repeats without a second notice or a second write, as after a reload", async () => {
    // Arrange
    const { layers, values, notified, api } = setup();
    values.table = JSON.stringify(cave);
    await layers.reconcile();
    const calls = api.calls.length;

    // Act
    await layers.reconcile();

    // Assert
    expect(notified).toEqual(["Cave"]);
    expect(
      api.calls.filter((c) => c.command === "setEffectEnabled"),
    ).toHaveLength(
      api.calls.slice(0, calls).filter((c) => c.command === "setEffectEnabled")
        .length,
    );
  });

  it("undoes at load a layer that ended while the player was away", async () => {
    // Arrange: an undo record, and no layer any more.
    const undo = JSON.stringify({
      ids: ["cave"],
      values: { effects: { echo: { on: false } } },
    });
    const { layers, values, local } = setup({ undo });

    // Act
    await layers.reconcile();

    // Assert
    expect(local().chosenEffects).toEqual([]);
    expect(values.undo).toBe("");
  });

  it("lets a personal layer override the table's", async () => {
    const { layers, values, local } = setup();
    values.table = JSON.stringify(cave);
    values.personal = JSON.stringify({
      ...cave,
      id: "orc",
      label: "Orc",
      effects: { reverb: { mix: 0.1 } },
    });

    await layers.reconcile();

    expect(local().audioEffectMix.reverb).toBe(0.1);
    expect(local().chosenEffects).toContain("reverb");
  });

  it("ignores a broken layer", async () => {
    const { layers, values, api } = setup();
    values.table = "{broken";

    await layers.reconcile();

    expect(api.calls).toEqual([]);
  });

  it("leaves a GM out of a table layer, unless it includes GMs", async () => {
    // Arrange
    const { layers, values, local } = setup({ selfIsGM: true });
    values.table = JSON.stringify(cave);

    // Act, Assert
    await layers.reconcile();
    expect(local().chosenEffects).not.toContain("reverb");
    values.table = JSON.stringify({ ...cave, includeGMs: true });
    await layers.reconcile();
    expect(local().chosenEffects).toContain("reverb");
  });

  it("says when part of a layer couldn't apply", async () => {
    const { layers, values } = setup();
    values.table = JSON.stringify({
      ...cave,
      effects: { krisp: { on: true } },
    });

    await layers.reconcile();

    expect(layers.states()).toEqual([
      { id: "cave", label: "Cave", state: "partly" },
    ]);
  });
});

describe("when applying fails", () => {
  it("tells the player once it finally applies, and repeats", async () => {
    // Arrange
    const { layers, values, notified, pipeline } = setup();
    values.table = JSON.stringify(cave);
    pipeline.mockRejectedValueOnce(new Error("boom"));

    // Act
    await layers.reconcile();
    expect(notified).toEqual([]);
    await layers.reconcile();

    // Assert
    expect(notified).toEqual(["Cave"]);
  });

  it("keeps what is to be given back", async () => {
    const { layers, values, pipeline } = setup();
    values.table = JSON.stringify(cave);
    pipeline.mockRejectedValueOnce(new Error("boom"));

    await layers.reconcile();

    expect(layers.held()?.effects.reverb?.mix).toBe(0.3);
  });
});

describe("whoever follows the layers", () => {
  it("hears of a change that needed no work here", async () => {
    // Arrange: a GM's client, whose own voice a table layer leaves alone.
    const { layers, values } = setup({ selfIsGM: true });
    const listener = vi.fn();
    layers.subscribe(listener);
    values.table = JSON.stringify(cave);

    // Act
    await layers.reconcile();

    // Assert
    expect(listener).toHaveBeenCalled();
  });
});

describe("refusing", () => {
  it("undoes one layer on this device, and the next applies again", async () => {
    // Arrange
    const { layers, values, local } = setup();
    values.table = JSON.stringify(cave);
    await layers.reconcile();

    // Act, Assert
    await layers.refuse("cave");
    expect(local().chosenEffects).not.toContain("reverb");
    expect(layers.states()).toEqual([
      { id: "cave", label: "Cave", state: "refused" },
    ]);

    values.table = JSON.stringify({ ...cave, id: "storm", label: "Storm" });
    await layers.reconcile();
    expect(local().chosenEffects).toContain("reverb");
  });

  it("can be taken back", async () => {
    const { layers, values, local } = setup();
    values.table = JSON.stringify(cave);
    await layers.refuse("cave");

    await layers.accept("cave");

    expect(local().chosenEffects).toContain("reverb");
  });

  it("forgets refusals of layers long gone", async () => {
    const { layers, values } = setup();
    values.refused = ["old"];
    values.table = JSON.stringify(cave);

    await layers.refuse("cave");

    expect(values.refused).toEqual(["cave"]);
  });

  it("keeps every layer out when asked, and lets them back in", async () => {
    // Arrange
    const { layers, values, local, notified } = setup();
    values.table = JSON.stringify(cave);

    // Act, Assert
    await layers.setKeptOut(true);
    await layers.reconcile();
    expect(local().chosenEffects).not.toContain("reverb");
    expect(notified).toEqual([]);
    expect(layers.keptOut()).toBe(true);

    await layers.setKeptOut(false);
    expect(local().chosenEffects).toContain("reverb");
  });
});

describe("locks", () => {
  it("say what a layer holds, for as long as it does", async () => {
    // Arrange
    const { layers, values } = setup();
    values.table = JSON.stringify(cave);

    // Act, Assert
    expect(layers.held()).toBeNull();
    await layers.reconcile();
    expect(layers.held()?.effects.reverb?.mix).toBe(0.3);
    values.table = "";
    await layers.reconcile();
    expect(layers.held()).toBeNull();
  });
});

describe("a preset during a layer", () => {
  it("changes what the layer leaves free, and waits for the rest", async () => {
    // Arrange
    const { layers, presets, values, local, api } = setup();
    await presets.saveAs("Mine");
    values.table = JSON.stringify(cave);
    await layers.reconcile();
    api.setState((s) => ({
      ...s,
      local: { ...s.local, audioChannelLevel: 0.4 },
    }));

    // Act: the preset has Channel level 1, and the reverb off at 0.3.
    await presets.apply("p");

    // Assert: free keys apply at once; the layer's stay.
    expect(local().audioChannelLevel).toBe(1);
    expect(local().audioEffectMix.reverb).toBe(0.6);
  });

  it("lands when the layer ends", async () => {
    // Arrange
    const { layers, presets, values, local, api } = setup();
    api.setState((s) => ({
      ...s,
      local: {
        ...s.local,
        audioEffectMix: { ...s.local.audioEffectMix, reverb: 0.5 },
      },
    }));
    await presets.saveAs("Mine");
    api.setState((s) => ({
      ...s,
      local: {
        ...s.local,
        audioEffectMix: { ...s.local.audioEffectMix, reverb: 0.3 },
      },
    }));
    values.table = JSON.stringify(cave);
    await layers.reconcile();

    // Act
    await presets.apply("p");
    values.table = "";
    await layers.reconcile();

    // Assert
    expect(local().audioEffectMix.reverb).toBe(0.5);
  });

  it("saves what lies under the layer, not the cave", async () => {
    // Arrange
    const { layers, presets, values } = setup();
    values.table = JSON.stringify(cave);
    await layers.reconcile();

    // Act
    const saved = await presets.saveAs("Mine");

    // Assert
    expect(saved.effects.reverb).toMatchObject({ on: false, mix: 0.3 });
  });

  it("isn't called changed for what the layer holds", async () => {
    const { layers, presets, values } = setup();
    await presets.saveAs("Mine");
    values.table = JSON.stringify(cave);

    await layers.reconcile();

    expect(presets.changed()).toBe(false);
  });
});

describe("a GM's layers", () => {
  function gm() {
    const written = { table: "", personal: new Map<string, string | null>() };
    const layers = createGmLayers({
      definitions: () => [reverb, eq],
      newId: () => "new",
      store: {
        table: () => written.table,
        setTable(json) {
          written.table = json;
          return Promise.resolve();
        },
        personal: (user) => written.personal.get(user) ?? "",
        setPersonal(user, json) {
          written.personal.set(user, json);
          return Promise.resolve();
        },
      },
    });
    return { layers, written };
  }
  const preset = {
    id: "p",
    name: "Cave",
    effects: { reverb: { on: true, place: "send", mix: 0.5 } },
  } as const;

  it("replaces the table layer whole, never merging", async () => {
    // Arrange
    const { layers, written } = gm();
    await layers.applyPreset(preset, { target: "table", includeGMs: true });

    // Act
    await layers.applyPreset(
      { ...preset, name: "Storm", effects: { eq: { on: true } } },
      { target: "table", includeGMs: false },
    );

    // Assert
    expect(JSON.parse(written.table)).toEqual({
      id: "new",
      label: "Storm",
      includeGMs: false,
      effects: { eq: { on: true } },
    });
  });

  it("writes a personal layer to that player alone", async () => {
    const { layers, written } = gm();

    await layers.applyPreset(preset, { target: "p1", includeGMs: false });

    expect(written.table).toBe("");
    expect(written.personal.get("p1")).toContain("Cave");
  });

  it("ends either", async () => {
    // Arrange
    const { layers, written } = gm();
    await layers.applyPreset(preset, { target: "table", includeGMs: false });
    await layers.applyPreset(preset, { target: "p1", includeGMs: false });

    // Act
    await layers.end("table");
    await layers.end("p1");

    // Assert
    expect(written.table).toBe("");
    expect(written.personal.get("p1")).toBeNull();
  });

  it("reads what is on, for the table's list", async () => {
    const { layers } = gm();

    await layers.applyPreset(preset, { target: "p1", includeGMs: false });

    expect(layers.tableLayer()).toBeNull();
    expect(layers.personalLayer("p1")?.label).toBe("Cave");
  });

  it("sets a layer a macro wrote by hand, refusing a bad one", async () => {
    // Arrange
    const { layers, written } = gm();

    // Act, Assert
    await layers.set("table", { label: "Cave", effects: {} });
    expect(JSON.parse(written.table)).toMatchObject({
      label: "Cave",
      id: "new",
    });
    await expect(
      layers.set("table", { label: "", effects: {} }),
    ).rejects.toThrow();
  });
});
