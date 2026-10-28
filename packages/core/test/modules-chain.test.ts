import { describe, expect, it } from "vitest";
import {
  BUILT_IN,
  chainOf,
  choose,
  tileOf,
  tilesOf,
} from "../src/modules/board/chain.ts";
import { piecesOf } from "../src/modules/pieces.ts";
import {
  BACKGROUND,
  catalog,
  DENOISE,
  DOCK,
  JITSI,
  KRISP,
  LIVEKIT,
  P2P,
  stateOf,
  VINES,
} from "./board-fixture.ts";

describe("a module's card", () => {
  it("carries the catalog's facts and icon", () => {
    const pieces = piecesOf(catalog);

    expect(pieces.find((p) => p.id === P2P)?.facts).toEqual([
      { label: "Table size", value: "Up to 6 players" },
    ]);
    expect(pieces.find((p) => p.id === LIVEKIT)?.icon).toBe(
      "fa-solid fa-tower-broadcast",
    );
    expect(pieces.find((p) => p.id === DOCK)).toMatchObject({
      facts: [],
      icon: null,
    });
  });
});

describe("the chain", () => {
  it("holds the plan by stage, Foundry's own cameras when there's no Dock", () => {
    // Arrange
    const state = stateOf({ [LIVEKIT]: "running", [DENOISE]: "running" });

    // Act
    const chain = chainOf(state);

    // Assert
    expect(chain).toEqual({
      effects: [DENOISE],
      service: [LIVEKIT],
      cameras: [BUILT_IN.cameras],
      look: [],
    });
  });

  it("dresses the Dock in its theme, or its own look", () => {
    expect(chainOf(stateOf({ [DOCK]: "running" })).look).toEqual([
      BUILT_IN.look,
    ]);
    expect(
      chainOf(stateOf({ [DOCK]: "running", [VINES]: "running" })).look,
    ).toEqual([VINES]);
  });
});

describe("a stage's tiles", () => {
  it("offer its modules, the built-in choice and what is coming soon", () => {
    const state = stateOf({ [LIVEKIT]: "running" });

    expect(tilesOf(state, "service").map((t) => t.id)).toEqual([
      LIVEKIT,
      P2P,
      JITSI,
    ]);
    expect(tilesOf(state, "cameras").map((t) => t.id)).toEqual([
      BUILT_IN.cameras,
      DOCK,
    ]);
    expect(tilesOf(state, "effects").map((t) => [t.id, t.status])).toEqual([
      [DENOISE, "missing"],
      [BACKGROUND, "missing"],
      [KRISP, "soon"],
    ]);
  });

  it("say what going live does to each", () => {
    const state = stateOf({ [LIVEKIT]: "running", [DOCK]: "off" }, [P2P, DOCK]);

    expect([P2P, DOCK, LIVEKIT].map((id) => [tileOf(state, id).note])).toEqual([
      ["install"],
      ["turnOn"],
      ["turnOff"],
    ]);
    expect(tileOf(state, P2P).inChain).toBe(true);
    expect(tileOf(state, BUILT_IN.cameras).inChain).toBe(false);
  });

  it("lock a theme until its Dock is in the chain", () => {
    expect(tileOf(stateOf({}), VINES).locked).toBe(DOCK);
    expect(tileOf(stateOf({ [DOCK]: "running" }), VINES).locked).toBeNull();
  });

  it("mark updates and modules the core didn't ship with", () => {
    const state = stateOf({ [LIVEKIT]: "running@0.4.0" }, undefined, {
      loaded: {
        catalog,
        source: "github",
        known: new Set([LIVEKIT]),
      },
    });

    expect(tileOf(state, LIVEKIT)).toMatchObject({
      update: true,
      isNew: false,
    });
    expect(tileOf(state, P2P)).toMatchObject({ update: false, isNew: true });
  });
});

describe("choosing in the chain", () => {
  it("swaps the service, telling what went", () => {
    const next = choose(stateOf({ [LIVEKIT]: "running" }), P2P);

    expect([...next.plan]).toEqual([P2P]);
    expect(next.dropped).toEqual([LIVEKIT]);
  });

  it("toggles an effect", () => {
    const state = stateOf({ [DENOISE]: "running" });

    expect([...choose(state, BACKGROUND).plan]).toEqual([DENOISE, BACKGROUND]);
    expect([...choose(state, DENOISE).plan]).toEqual([]);
  });

  it("brings the Dock with a theme chosen without it", () => {
    const next = choose(stateOf({}), VINES);

    expect([...next.plan]).toEqual([DOCK, VINES]);
    expect(next.added).toEqual([DOCK]);
  });

  it("goes back to Foundry's own cameras, the theme going with the Dock", () => {
    const state = stateOf({ [DOCK]: "running", [VINES]: "running" });

    const next = choose(state, BUILT_IN.cameras);

    expect([...next.plan]).toEqual([]);
    expect(next.dropped).toEqual([DOCK, VINES]);
  });

  it("goes back to the Dock's own look", () => {
    const state = stateOf({ [DOCK]: "running", [VINES]: "running" });

    expect([...choose(state, BUILT_IN.look).plan]).toEqual([DOCK]);
  });

  it("changes nothing for what is coming soon", () => {
    const state = stateOf({});

    expect(choose(state, KRISP).plan).toBe(state.plan);
  });
});
