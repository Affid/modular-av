import type {
  Contribution,
  Observable,
  SurfaceDefinition,
} from "@modular-av/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateContribution, validateSurface } from "../src/contributions.ts";
import { createTable } from "./table.ts";

const observable = <T>(value: T): Observable<T> => ({
  get: () => value,
  subscribe: () => () => undefined,
});

const done = (): Promise<void> => Promise.resolve();

const blur: Contribution = {
  kind: "control",
  place: "quick",
  type: "toggle",
  id: "cam.blur",
  label: "Blur",
  icon: "fa-solid fa-droplet",
  state: observable({ on: false }),
  set: done,
  controls: [
    {
      type: "range",
      id: "cam.strength",
      label: "Strength",
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      state: observable(50),
      set: done,
    },
  ],
};

const VALID: readonly Contribution[] = [
  blur,
  {
    kind: "control",
    place: "settings",
    type: "choice",
    id: "mic.model",
    label: "Model",
    options: [{ value: "rnnoise", label: "RNNoise" }],
    state: observable("rnnoise"),
    set: done,
  },
  {
    kind: "participant-action",
    id: "gm.kick",
    label: "Remove",
    gmOnly: true,
    run: done,
  },
  {
    kind: "indicator",
    id: "cam.badge",
    label: "Blur on",
    icon: "fa-solid fa-droplet",
    active: observable(new Set<string>()),
  },
  {
    kind: "status-row",
    id: "lk.region",
    label: "Region",
    value: observable("eu"),
  },
  {
    kind: "settings-section",
    id: "lk.settings",
    label: "LiveKit",
    settings: ["modular-av-livekit.url", "modular-av-livekit.apiSecret"],
    secrets: ["modular-av-livekit.apiSecret"],
    tab: "call",
  },
  {
    kind: "control",
    place: "quick",
    type: "range",
    id: "cam.strength",
    label: "Strength",
    min: 10,
    max: 100,
    step: 5,
    state: observable(60),
    set: () => Promise.resolve(),
    // Shown with the blur's choice, while blur is chosen.
    effect: "background-blur",
  },
];

describe("contribution checks", () => {
  it("accepts every kind of contribution", () => {
    for (const contribution of VALID)
      expect(() => {
        validateContribution(contribution);
      }).not.toThrow();
  });

  it.each([
    ["an unknown kind", { ...blur, kind: "banner" }, /kind/],
    ["a label that isn't text", { ...blur, label: 3 }, /label/],
    ["an empty label", { ...blur, label: "" }, /label/],
    ["an icon that isn't Font Awesome", { ...blur, icon: 'x" onload' }, /icon/],
    ["an unknown place", { ...blur, place: "header" }, /place/],
    ["an unknown control", { ...blur, type: "dial" }, /type/],
    [
      "a state that isn't observable",
      { ...blur, state: { on: true } },
      /state/,
    ],
    ["a missing command", { ...blur, set: undefined }, /set/],
    [
      "a range that can't move",
      { ...blur, type: "range", min: 5, max: 5, step: 1, state: observable(5) },
      /range/,
    ],
    [
      "options that aren't text",
      {
        ...blur,
        type: "choice",
        options: [{ value: 1 }],
        state: observable(""),
      },
      /options/,
    ],
    [
      "controls nested twice",
      { ...blur, controls: [{ ...blur, id: "inner", controls: [] }] },
      /nested/,
    ],
    [
      "a setting key without its module",
      { ...VALID[5], settings: ["url"] },
      /setting/,
    ],
    ["an indicator without an icon", { ...VALID[3], icon: undefined }, /icon/],
    ["an effect that isn't an id", { ...blur, effect: "" }, /effect/],
    ["a tab no window has", { ...VALID[5], tab: "sidebar" }, /tab/],
    [
      "a render that isn't a function",
      { ...blur, render: "<b>hi</b>" },
      /render/,
    ],
  ])("refuses %s", (_name, contribution, message) => {
    expect(() => {
      validateContribution(contribution);
    }).toThrow(message);
  });

  it("names the contribution in the error", () => {
    expect(() => {
      validateContribution({ ...blur, label: "" });
    }).toThrow(/"cam.blur"/);
  });
});

describe("surface checks", () => {
  it("accepts the three kinds of surface", () => {
    const surfaces: readonly SurfaceDefinition[] = [
      {
        kind: "cameras",
        id: "d.cameras",
        label: "Dock",
        mount: () => ({ unmount: () => undefined }),
      },
      {
        kind: "settings",
        id: "d.settings",
        label: "Dock",
        render: () => () => undefined,
      },
      {
        kind: "players",
        id: "d.players",
        label: "Dock",
        decorate: () => undefined,
      },
    ];
    for (const surface of surfaces)
      expect(() => {
        validateSurface(surface);
      }).not.toThrow();
  });

  it("refuses a surface of no known kind or without its function", () => {
    expect(() => {
      validateSurface({ kind: "tokens", id: "t", label: "T" });
    }).toThrow(/kind/);
    expect(() => {
      validateSurface({ kind: "cameras", id: "t", label: "T" });
    }).toThrow(/mount/);
  });
});

describe("registering surfaces and contributions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes them in the register hook and refuses bad ones there", async () => {
    // Arrange
    const table = createTable();
    const errors: unknown[] = [];

    // Act
    const p1 = table.join("p1", {
      register(api) {
        api.contributions.register(blur);
        try {
          api.contributions.register({ ...blur, id: "bad", label: "" });
        } catch (error: unknown) {
          errors.push(error);
        }
        api.surfaces.register({
          kind: "players",
          id: "d.players",
          label: "Dock",
          decorate: () => undefined,
        });
      },
    });
    await table.settle();

    // Assert
    expect(p1.api.contributions.list()).toEqual([blur]);
    expect(p1.api.surfaces.list().map((s) => s.id)).toEqual(["d.players"]);
    expect(errors).toHaveLength(1);
    expect(() => {
      p1.api.contributions.register({ ...blur, id: "late" });
    }).toThrow(/contributions: "late" registered too late/);
  });
});
