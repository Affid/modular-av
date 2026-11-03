import type {
  ChoiceControl,
  ControlContribution,
  EffectDefinition,
  Observable,
  RangeControl,
  ToggleControl,
} from "@modular-av/api";
import { localState } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import {
  captureSnapshot,
  matchesSnapshot,
  parseSnapshot,
  planSnapshot,
  type Snapshot,
} from "../src/model/snapshot.ts";
import { effect } from "./context.ts";

const fixed = <T>(value: T): Observable<T> => ({
  get: () => value,
  subscribe: () => () => undefined,
});

const attached = { kind: "control", place: "quick", effect: "reverb" } as const;

const decay = {
  ...attached,
  type: "range",
  id: "decay",
  label: "Decay",
  min: 0.3,
  max: 3,
  step: 0.1,
  state: fixed(1.5),
  set: vi.fn(() => Promise.resolve()),
} as ControlContribution & RangeControl;

const wide = {
  ...attached,
  type: "toggle",
  id: "wide",
  label: "Wide",
  state: fixed({ on: true }),
  set: vi.fn(() => Promise.resolve()),
} as ControlContribution & ToggleControl;

const room = {
  ...attached,
  type: "choice",
  id: "room",
  label: "Room",
  options: [
    { value: "hall", label: "Hall" },
    { value: "cave", label: "Cave" },
  ],
  state: fixed("hall"),
  set: vi.fn(() => Promise.resolve()),
} as ControlContribution & ChoiceControl;

const rnnoise = effect("rnnoise", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});
const gtcrn = effect("gtcrn", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});
const eq = effect("eq", "pre-gate");
const reverb = effect("reverb", "send", { tail: 3 });
const radio = effect("radio", "post-gate");
const dryWet = effect("dry-wet", "post-gate", { latency: 0.01 });

const ALL: readonly EffectDefinition[] = [rnnoise, gtcrn, eq, reverb, radio];

const places = {
  rnnoise: "pre-gate",
  gtcrn: "pre-gate",
  eq: "pre-gate",
  reverb: "send",
  radio: "post-gate",
} as const;

const local = (changes: Parameters<typeof localState>[0] = {}) =>
  localState({ audioEffectPlaces: places, ...changes });

const controls = [decay, wide, room];

describe("what a preset holds", () => {
  it("is every audio effect's switch, place, level and settings, chosen or not", () => {
    // Act
    const snapshot = captureSnapshot(
      ALL,
      local({
        chosenEffects: ["reverb"],
        audioEffectMix: { reverb: 0.4 },
        audioChannelLevel: 0.7,
      }),
      controls,
    );

    // Assert
    expect(snapshot.effects.reverb).toEqual({
      on: true,
      place: "send",
      mix: 0.4,
      settings: { decay: 1.5, wide: true, room: "hall" },
    });
    expect(snapshot.effects.eq).toEqual({ on: false, place: "pre-gate" });
    expect(snapshot.channelLevel).toBe(0.7);
  });

  it("holds the order of the chain: only what is on or kept, as it runs", () => {
    const snapshot = captureSnapshot(
      ALL,
      local({
        audioEffectOrder: {
          "pre-gate": ["eq", "rnnoise"],
          "post-gate": [],
          send: [],
        },
      }),
      [],
    );

    expect(snapshot.order).toEqual({
      "pre-gate": ["eq", "rnnoise"],
      "post-gate": [],
      send: [],
    });
  });

  it("leaves out video effects", () => {
    const blur = {
      ...eq,
      id: "blur",
      kind: "video",
    } as unknown as EffectDefinition;

    const snapshot = captureSnapshot([blur, eq], local(), []);

    expect(Object.keys(snapshot.effects)).toEqual(["eq"]);
  });
});

describe("reading a saved preset", () => {
  const good: Snapshot = {
    effects: {
      reverb: { on: true, place: "send", mix: 0.4, settings: { decay: 2 } },
    },
    order: { send: ["reverb"] },
    channelLevel: 1,
  };

  it("takes what it saved", () => {
    expect(parseSnapshot(good)).toEqual(good);
  });

  it("takes one that sets only some keys, as a layer does", () => {
    const part = { effects: { reverb: { on: true } } };

    expect(parseSnapshot(part)).toEqual(part);
  });

  it.each([
    ["nothing", null],
    ["a string", "nope"],
    ["no effects", {}],
    ["an effect that isn't an object", { effects: { a: 1 } }],
    ["a switch that isn't one", { effects: { a: { on: "yes" } } }],
    ["an unknown place", { effects: { a: { place: "master" } } }],
    ["a mix out of range", { effects: { a: { mix: 2 } } }],
    ["a mix that isn't a number", { effects: { a: { mix: "1" } } }],
    ["settings holding an object", { effects: { a: { settings: { b: {} } } } }],
    [
      "a setting too long to be a value",
      { effects: { a: { settings: { b: "x".repeat(300) } } } },
    ],
    ["an order for an unknown place", { effects: {}, order: { master: [] } }],
    ["an order that isn't a list", { effects: {}, order: { send: "a" } }],
    ["an order of non-strings", { effects: {}, order: { send: [1] } }],
    ["a Channel level out of range", { effects: {}, channelLevel: -1 }],
    [
      "too many effects",
      {
        effects: Object.fromEntries(
          Array.from({ length: 300 }, (_, i) => [
            `e${String(i)}`,
            { on: true },
          ]),
        ),
      },
    ],
  ])("refuses %s", (_, bad) => {
    expect(parseSnapshot(bad)).toBeNull();
  });

  it("keeps a prototype name from reaching an object", () => {
    const parsed = parseSnapshot(
      JSON.parse('{"effects":{"__proto__":{"on":true}}}'),
    );

    expect(({} as { on?: boolean }).on).toBeUndefined();
    expect(parsed?.effects).toEqual({});
  });
});

describe("what applying a preset does", () => {
  const preset: Snapshot = {
    effects: {
      rnnoise: { on: false, place: "pre-gate" },
      reverb: { on: true, place: "send", mix: 0.5 },
    },
    order: { send: ["reverb"] },
    channelLevel: 0.8,
  };

  it("turns on what must start and off what must stop", () => {
    const plan = planSnapshot(
      preset,
      ALL,
      local({ chosenEffects: ["rnnoise"] }),
      [],
    );

    expect(plan.off).toEqual(["rnnoise"]);
    expect(plan.on).toEqual(["reverb"]);
  });

  it("leaves alone what is already as it says", () => {
    const plan = planSnapshot(
      preset,
      ALL,
      local({ chosenEffects: ["reverb"] }),
      [],
    );

    expect(plan.off).toEqual([]);
    expect(plan.on).toEqual([]);
  });

  it("doesn't turn off what its group swaps, so noise suppression never gaps", () => {
    const swap: Snapshot = {
      effects: {
        rnnoise: { on: false, place: "pre-gate" },
        gtcrn: { on: true, place: "pre-gate" },
      },
    };

    const plan = planSnapshot(
      swap,
      ALL,
      local({ chosenEffects: ["rnnoise"] }),
      [],
    );

    expect(plan.off).toEqual([]);
    expect(plan.on).toEqual(["gtcrn"]);
  });

  it("makes one pipeline change, with places, order, mix and Channel level", () => {
    const plan = planSnapshot(preset, ALL, local(), []);

    expect(plan.change).toEqual({
      places: { rnnoise: "pre-gate", reverb: "send" },
      order: { send: ["reverb"] },
      mix: { reverb: 0.5 },
      channelLevel: 0.8,
    });
  });

  it("skips an effect no longer registered, and says so", () => {
    const gone: Snapshot = {
      effects: { krisp: { on: true, place: "pre-gate", mix: 0.5 } },
      order: { "pre-gate": ["krisp", "eq"] },
    };

    const plan = planSnapshot(gone, ALL, local(), []);

    expect(plan.missing).toEqual(["krisp"]);
    expect(plan.on).toEqual([]);
    expect(plan.change).toEqual({ order: { "pre-gate": ["eq"] } });
  });

  it("skips what this browser can't run, and says so", () => {
    const plan = planSnapshot(
      { effects: { reverb: { on: true } } },
      ALL,
      local({ effects: { reverb: { status: "unsupported", error: null } } }),
      [],
    );

    expect(plan.unsupported).toEqual(["reverb"]);
    expect(plan.on).toEqual([]);
  });

  it("still chooses what this call doesn't offer: the core starts it when it can", () => {
    const plan = planSnapshot(
      { effects: { reverb: { on: true } } },
      ALL,
      local({ effects: { reverb: { status: "unavailable", error: null } } }),
      [],
    );

    expect(plan.on).toEqual(["reverb"]);
  });

  it("leaves out a mix at a place that has none", () => {
    const plan = planSnapshot(
      { effects: { reverb: { place: "post-gate", mix: 0.5 } } },
      ALL,
      local(),
      [],
    );

    expect(plan.change.mix).toBeUndefined();
  });

  it("keeps a mix for an effect with its own dry:wet, wherever it runs", () => {
    const plan = planSnapshot(
      { effects: { "dry-wet": { place: "post-gate", mix: 0.5 } } },
      [dryWet],
      local(),
      [],
    );

    expect(plan.change.mix).toEqual({ "dry-wet": 0.5 });
  });

  it("drops from an order what it moves elsewhere", () => {
    const plan = planSnapshot(
      {
        effects: { eq: { place: "send" } },
        order: { "pre-gate": ["eq", "rnnoise"] },
      },
      ALL,
      local(),
      [],
    );

    expect(plan.change.order).toEqual({ "pre-gate": ["rnnoise"] });
  });

  it("sets an effect's settings that its controls accept", () => {
    const plan = planSnapshot(
      {
        effects: {
          reverb: { settings: { decay: 2, wide: false, room: "cave" } },
        },
      },
      ALL,
      local(),
      controls,
    );

    expect(plan.settings.map((s) => [s.control.id, s.value])).toEqual([
      ["decay", 2],
      ["wide", false],
      ["room", "cave"],
    ]);
  });

  it.each([
    ["below a range", { decay: 0 }],
    ["above a range", { decay: 9 }],
    ["the wrong type for a range", { decay: "2" }],
    ["the wrong type for a toggle", { wide: 1 }],
    ["an option that doesn't exist", { room: "attic" }],
    ["a control that doesn't exist", { gone: 1 }],
  ])("skips a setting %s", (_, settings) => {
    const plan = planSnapshot(
      { effects: { reverb: { settings } } },
      ALL,
      local(),
      controls,
    );

    expect(plan.settings).toEqual([]);
  });

  it("speaks only for what it lists", () => {
    const plan = planSnapshot(
      { effects: {} },
      ALL,
      local({ chosenEffects: ["eq"] }),
      [],
    );

    expect(plan.off).toEqual([]);
    expect(plan.change).toEqual({});
  });
});

describe("whether the channel still matches a preset", () => {
  const state = local({
    chosenEffects: ["reverb"],
    audioEffectMix: { reverb: 0.4 },
    audioChannelLevel: 0.7,
  });
  const saved = captureSnapshot(ALL, state, controls);

  it("does, right after capturing it", () => {
    expect(matchesSnapshot(saved, ALL, state, controls)).toBe(true);
  });

  it.each([
    ["an effect turned on", { chosenEffects: ["reverb", "eq"] }],
    ["an effect turned off", { chosenEffects: [] }],
    ["a level", { audioEffectMix: { reverb: 0.5 } }],
    ["Channel level", { audioChannelLevel: 0.5 }],
    ["a place", { audioEffectPlaces: { ...places, radio: "send" } }],
    [
      "the order",
      {
        audioEffectOrder: {
          "pre-gate": ["eq", "rnnoise"],
          "post-gate": [],
          send: [],
        },
      },
    ],
  ] as const)("doesn't after a change of %s", (_, change) => {
    expect(matchesSnapshot(saved, ALL, { ...state, ...change }, controls)).toBe(
      false,
    );
  });

  it("doesn't once an effect kept off is taken out of the chain", () => {
    const kept = {
      ...state,
      audioEffectOrder: { "pre-gate": ["eq"], "post-gate": [], send: [] },
    };

    const withEq = captureSnapshot(ALL, kept, controls);

    expect(matchesSnapshot(withEq, ALL, kept, controls)).toBe(true);
    expect(matchesSnapshot(withEq, ALL, state, controls)).toBe(false);
  });

  it("doesn't after an effect's setting changed", () => {
    const other = captureSnapshot(ALL, state, [{ ...decay, state: fixed(2) }]);

    expect(matchesSnapshot(other, ALL, state, controls)).toBe(false);
  });

  it("ignores what it can't speak for: a module gone, one added", () => {
    const withGone: Snapshot = {
      ...saved,
      effects: { ...saved.effects, krisp: { on: true, place: "pre-gate" } },
    };
    const added = [...ALL, effect("new", "send")];

    expect(matchesSnapshot(withGone, added, state, controls)).toBe(true);
  });
});
