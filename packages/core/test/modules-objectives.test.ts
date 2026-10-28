import { describe, expect, it } from "vitest";
import { buildsFor, withBuild } from "../src/modules/board/builds.ts";
import {
  checksOf,
  currentOf,
  objectivesOf,
  type SectionInfo,
} from "../src/modules/board/objectives.ts";
import { piecesOf } from "../src/modules/pieces.ts";
import {
  catalog,
  DENOISE,
  DOCK,
  JITSI,
  LIVEKIT,
  P2P,
  stateOf,
  VINES,
} from "./board-fixture.ts";

describe("the starter builds", () => {
  it("are offered when the catalog has all their modules", () => {
    const pieces = piecesOf(catalog);

    expect(buildsFor(pieces).map((b) => b.id)).toEqual([
      "browsers",
      "livekit",
      "jitsi",
    ]);
    expect(
      buildsFor(pieces.filter((p) => p.id !== JITSI)).map((b) => b.id),
    ).toEqual(["browsers", "livekit"]);
  });

  it("fill the chain, keeping the effects and theme already chosen", () => {
    const state = stateOf({}, [JITSI, VINES, DOCK]);
    const livekit = buildsFor(state.pieces).find((b) => b.id === "livekit");
    if (!livekit) throw new Error("no build");

    const next = withBuild(state, livekit);

    expect([...next.plan].sort()).toEqual(
      [LIVEKIT, DOCK, DENOISE, VINES].sort(),
    );
    expect(next.dropped).toEqual([JITSI]);
  });
});

const keys = (state: Parameters<typeof objectivesOf>[0]) =>
  objectivesOf(state, []).map((o) => [o.key, o.state]);

describe("Load in, Go live, Soundcheck", () => {
  it("wait for a service first", () => {
    const objectives = objectivesOf(stateOf({}), []);

    expect(objectives.map((o) => [o.key, o.state])).toEqual([
      ["load", "blocked"],
      ["live", "blocked"],
      ["check", "later"],
    ]);
    expect(currentOf(objectives, stateOf({}))).toBe("load");
  });

  it("ask to install, then to go live, then to check", () => {
    const missing = stateOf({}, [P2P]);
    const installed = stateOf({ [P2P]: "off" }, [P2P]);
    const live = stateOf({ [P2P]: "running" });

    expect(keys(missing)).toEqual([
      ["load", "todo"],
      ["live", "waiting"],
      ["check", "later"],
    ]);
    expect(keys(installed)).toEqual([
      ["load", "done"],
      ["live", "todo"],
      ["check", "later"],
    ]);
    expect(keys(live)).toEqual([
      ["load", "done"],
      ["live", "done"],
      ["check", "done"],
    ]);
  });

  it("count what came back installed from the trip to Setup", () => {
    const back = stateOf({ [P2P]: "off" }, [P2P, DOCK], { trip: [P2P, DOCK] });

    const load = objectivesOf(back, [])[0];

    expect(load).toMatchObject({ state: "todo", progress: [1, 2] });
    // Back from Setup with something to go live with: that comes first.
    expect(currentOf(objectivesOf(back, []), back)).toBe("live");
  });
});

describe("Soundcheck's list", () => {
  const sections: readonly SectionInfo[] = [
    { id: "denoise", moduleId: DENOISE, label: "Noise", tab: "voice" },
    { id: "other", moduleId: DOCK, label: "Other", tab: null },
  ];
  const configured = [LIVEKIT];

  it("has each running module's settings, its theme, and its effects", () => {
    const state = stateOf({
      [LIVEKIT]: "running",
      [DOCK]: "running",
      [VINES]: "running",
      [DENOISE]: "running",
    });

    const checks = checksOf(state, sections, configured);

    expect(checks.map((c) => [c.id, c.target, c.locked])).toEqual([
      ["foundry:" + LIVEKIT, { foundry: LIVEKIT }, false],
      ["section:denoise", { tab: "voice" }, false],
      ["section:other", { tab: "more" }, false],
      ["theme", { tab: "appearance" }, false],
      ["effects", null, false],
    ]);
  });

  it("locks what isn't on air yet, and is done once each is checked", () => {
    const planned = stateOf({}, [LIVEKIT]);
    const running = stateOf({ [LIVEKIT]: "running" }, undefined, {
      checked: new Set(["foundry:" + LIVEKIT]),
    });
    const unchecked = stateOf({ [LIVEKIT]: "running" });
    const soundcheck = (state: typeof running) =>
      objectivesOf(state, checksOf(state, sections, configured))[2]?.state;

    expect(checksOf(planned, sections, configured)[0]?.locked).toBe(true);
    expect(soundcheck(running)).toBe("done");
    expect(soundcheck(unchecked)).toBe("todo");
  });
});
