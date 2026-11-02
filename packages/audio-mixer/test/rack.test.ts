import type { AudioPlace, LocalState } from "@modular-av/api";
import { localState } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import {
  addTo,
  cardStateOf,
  fadersOf,
  moveTo,
  moveWithin,
  NOISE_KEY,
  offersFor,
  rackOf,
  removeFrom,
  switchModel,
  type Rack,
} from "../src/model/rack.ts";
import { effect } from "./context.ts";

const rnnoise = effect("rnnoise", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});
const gtcrn = effect("gtcrn", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});
const eq = effect("eq", "pre-gate");
const radio = effect("radio", "post-gate");
const reverb = effect("reverb", "send", { tail: 3 });
const echo = effect("echo", "send", { tail: 2 });
const ALL = [rnnoise, gtcrn, eq, radio, reverb, echo];

const NO_ORDER: Record<AudioPlace, readonly string[]> = {
  "pre-gate": [],
  "post-gate": [],
  send: [],
};

function local(change: Partial<LocalState> = {}): LocalState {
  return localState({
    audioEffectPlaces: Object.fromEntries(
      ALL.map((d) => [d.id, d.defaultPlace]),
    ),
    audioEffectOrder: NO_ORDER,
    ...change,
  });
}

const keys = (racks: readonly Rack[]) =>
  racks.map((rack) => rack.slots.map((slot) => slot.key));

describe("the chain", () => {
  it("holds only what is on or kept in a place's order", () => {
    const racks = rackOf(
      ALL,
      local({
        chosenEffects: ["reverb"],
        audioEffectOrder: { ...NO_ORDER, "pre-gate": ["eq"] },
      }),
    );

    expect(keys(racks)).toEqual([["eq"], [], ["reverb"]]);
  });

  it("shows the noise models as one card, running the chosen one", () => {
    const racks = rackOf(
      ALL,
      local({
        chosenEffects: ["gtcrn", "eq"],
        audioEffectOrder: { ...NO_ORDER, "pre-gate": ["rnnoise", "eq"] },
      }),
    );

    const [noise] = racks[0]?.slots ?? [];
    expect(keys(racks)[0]).toEqual([NOISE_KEY, "eq"]);
    expect(noise?.effect.id).toBe("gtcrn");
    expect(noise?.members.map((d) => d.id)).toEqual(["rnnoise", "gtcrn"]);
  });

  it("keeps a noise model that is off as the card's model", () => {
    const racks = rackOf(
      ALL,
      local({ audioEffectOrder: { ...NO_ORDER, "pre-gate": ["gtcrn"] } }),
    );

    expect(racks[0]?.slots[0]?.effect.id).toBe("gtcrn");
  });
});

describe("changing the chain", () => {
  it("adds an effect at the end of a place, then turns it on", () => {
    const racks = rackOf(ALL, local({ chosenEffects: ["eq"] }));

    expect(addTo(racks, eq, "post-gate")).toEqual({
      change: {
        places: { eq: "post-gate" },
        order: { "pre-gate": [], "post-gate": ["eq"] },
      },
      enable: [],
    });
    expect(addTo(racks, reverb, "send")).toEqual({
      change: { places: { reverb: "send" }, order: { send: ["reverb"] } },
      enable: [["reverb", true]],
    });
  });

  it("removes a card: out of the order, and off", () => {
    const racks = rackOf(
      ALL,
      local({
        chosenEffects: ["rnnoise", "eq"],
        audioEffectOrder: { ...NO_ORDER, "pre-gate": ["rnnoise", "eq"] },
      }),
    );

    expect(removeFrom(racks, NOISE_KEY)).toEqual({
      change: { order: { "pre-gate": ["eq"] } },
      enable: [["rnnoise", false]],
    });
  });

  it("moves a card along its place, and not past either end", () => {
    const racks = rackOf(ALL, local({ chosenEffects: ["rnnoise", "eq"] }));

    expect(moveWithin(racks, "eq", -1)).toEqual({
      change: { order: { "pre-gate": ["eq", "rnnoise"] } },
      enable: [],
    });
    expect(moveWithin(racks, "eq", 1)).toBeNull();
  });

  it("moves a card to another place, at a position", () => {
    const racks = rackOf(ALL, local({ chosenEffects: ["eq", "radio"] }));

    expect(moveTo(racks, "eq", "post-gate", 0)).toEqual({
      change: {
        places: { eq: "post-gate" },
        order: { "pre-gate": [], "post-gate": ["eq", "radio"] },
      },
      enable: [],
    });
  });

  it("swaps the noise model in its slot, and runs it if the card is on", () => {
    const running = local({ chosenEffects: ["rnnoise", "eq"] });
    const kept = local({
      audioEffectOrder: { ...NO_ORDER, "pre-gate": ["rnnoise"] },
    });
    const on = rackOf(ALL, running);
    const off = rackOf(ALL, kept);

    expect(switchModel(on, "gtcrn", running)).toEqual({
      change: {
        places: { gtcrn: "pre-gate" },
        order: { "pre-gate": ["gtcrn", "eq"] },
      },
      enable: [["gtcrn", true]],
    });
    expect(switchModel(off, "gtcrn", kept)?.enable).toEqual([]);
  });
});

describe("a card's state", () => {
  it("tells off from waiting, failing and running", () => {
    const state = local({
      chosenEffects: ["reverb", "echo", "eq"],
      audioEffectOrder: { ...NO_ORDER, "post-gate": ["radio"] },
      effects: {
        reverb: { status: "running", error: null },
        echo: { status: "unavailable", error: null },
        eq: { status: "failed", error: "x" },
      },
    });
    const of = (id: string) => {
      const slot = rackOf(ALL, state)
        .flatMap((rack) => rack.slots)
        .find((s) => s.key === id);
      return slot ? cardStateOf(slot, state) : null;
    };

    expect([of("reverb"), of("echo"), of("eq"), of("radio")]).toEqual([
      "on",
      "waiting",
      "failed",
      "off",
    ]);
  });
});

describe("the levels", () => {
  it("has a fader for each effect with a level, in the chain's order", () => {
    const state = local({
      chosenEffects: ["reverb", "echo"],
      audioEffectOrder: { ...NO_ORDER, send: ["echo", "reverb"] },
      audioEffectMix: { reverb: 0.4, echo: 0.25, eq: 1 },
    });

    const faders = fadersOf(rackOf(ALL, state), state);

    expect(faders.map((f) => [f.key, f.value])).toEqual([
      ["echo", 0.25],
      ["reverb", 0.4],
    ]);
  });
});

describe("the effect browser", () => {
  it("offers what isn't in the chain: made for this place first, recent before that", () => {
    const state = local({ chosenEffects: ["reverb"] });
    const offers = offersFor(ALL, state, rackOf(ALL, state), "send", ["eq"]);

    expect(offers.recent.map((o) => o.key)).toEqual(["eq"]);
    expect(offers.forPlace.map((o) => o.key)).toEqual(["echo"]);
    expect(offers.others.map((o) => o.key)).toEqual([NOISE_KEY, "radio"]);
    expect(offers.inChain.map((o) => o.key)).toEqual(["reverb"]);
  });

  it("leaves out what the call can't run, and says why this browser can't", () => {
    const state = local({
      effects: {
        echo: { status: "unavailable", error: null },
        eq: { status: "unsupported", error: null },
      },
    });
    const offers = offersFor(ALL, state, rackOf(ALL, state), "send", []);
    const all = [...offers.forPlace, ...offers.others];

    expect(all.map((o) => o.key)).not.toContain("echo");
    expect(all.find((o) => o.key === "eq")?.unsupported).toBe(true);
  });
});
