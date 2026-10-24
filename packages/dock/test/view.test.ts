import {
  localState,
  participantState,
  sessionState,
} from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { panelView } from "../src/view/panel-view.ts";
import { sessionView } from "../src/view/session-view.ts";
import { orderTiles, tileView } from "../src/view/tile-view.ts";

const BOTH = { audio: true, video: true } as const;
const local = localState();

describe("a player's tile", () => {
  it("is plain for someone connected, sending both and quiet", () => {
    const view = tileView(participantState({ id: "p1" }), local, BOTH);

    expect(view).toMatchObject({
      id: "p1",
      name: "p1",
      video: "on",
      indicators: [],
      flags: {
        speaking: false,
        muted: false,
        deafened: false,
        blockedAudio: false,
        blockedVideo: false,
        connected: true,
        hiddenByMe: false,
      },
    });
  });

  it.each([
    ["muted", { muted: true }, "muted"],
    ["deafened", { deafened: true }, "deafened"],
    ["hidden by this player", { hiddenByMe: true }, "hidden-by-me"],
    ["on a poor connection", { quality: "poor" as const }, "connection"],
    ["reconnecting their link", { quality: "lost" as const }, "connection"],
    ["in Foundry but not in the call", { connected: false }, "not-connected"],
  ])("shows a player %s", (_name, changes, indicator) => {
    const view = tileView(
      participantState({ id: "p1", ...changes }),
      local,
      BOTH,
    );

    expect(view.indicators).toContain(indicator);
  });

  it("shows speaking as a flag, never as a decision of its own", () => {
    const view = tileView(
      participantState({ id: "p1", speaking: true, muted: true }),
      local,
      BOTH,
    );

    expect(view.flags).toMatchObject({ speaking: true, muted: true });
  });

  it("tells a GM's block from what the world's mode allows", () => {
    const blocked = participantState({
      id: "p1",
      canBroadcast: { audio: false, video: false },
      hasVideo: false,
    });

    const byGm = tileView(blocked, local, BOTH);
    const audioOnly = tileView(blocked, local, { audio: false, video: false });

    expect(byGm.indicators).toEqual(["blocked-audio", "blocked-video"]);
    expect(byGm.video).toBe("blocked");
    expect(byGm.flags).toMatchObject({
      blockedAudio: true,
      blockedVideo: true,
    });
    expect(audioOnly.indicators).toEqual([]);
    expect(audioOnly.video).toBe("off");
  });

  it("shows the local player's own warnings on their tile only", () => {
    const warned = localState({
      openMic: true,
      speakingWhileMuted: true,
      cameraHold: "effect-failed",
    });
    const me = participantState({ id: "me", isLocal: true });

    const mine = tileView(me, warned, BOTH);
    const theirs = tileView(participantState({ id: "p1" }), warned, BOTH);

    expect(mine.indicators).toEqual([
      "open-mic",
      "speaking-while-muted",
      "camera-held",
    ]);
    expect(theirs.indicators).toEqual([]);
  });

  it("orders the local player first, then the GMs, then by name", () => {
    const tiles = orderTiles([
      participantState({ id: "b", name: "Bea" }),
      participantState({ id: "gm", name: "Zed", isGM: true }),
      participantState({ id: "me", name: "Me", isLocal: true }),
      participantState({ id: "a", name: "anna" }),
    ]);

    expect(tiles.map((t) => t.id)).toEqual(["me", "gm", "a", "b"]);
  });
});

describe("the session's status", () => {
  const NOW = 1_000_000;

  it.each([
    ["idle", {}, "idle", null],
    ["waiting-for-token", {}, "connecting", null],
    ["connecting", {}, "connecting", null],
    ["connected", {}, "connected", null],
    ["waiting-for-gm", {}, "waiting", null],
    ["resuming", {}, "reconnecting", null],
    [
      "retrying",
      { nextRetryAt: NOW + 4200, attempt: 2 },
      "reconnecting",
      "reconnect",
    ],
    ["left", { reason: "left" as const }, "ended", "rejoin"],
    ["left", { reason: "kicked" as const }, "ended", null],
    ["left", { reason: "full" as const }, "ended", "rejoin"],
    ["left", { reason: "joined-elsewhere" as const }, "ended", "rejoin"],
  ] as const)("shows %s %o as %s", (status, changes, kind, action) => {
    const view = sessionView(sessionState({ status, ...changes }), NOW);

    expect([view.kind, view.action]).toEqual([kind, action]);
  });

  it("counts down to the next try in whole seconds", () => {
    const view = sessionView(
      sessionState({ status: "retrying", nextRetryAt: NOW + 4200, attempt: 2 }),
      NOW,
    );

    expect(view.text).toEqual({
      key: "status.retrying",
      params: { seconds: "5" },
    });
  });

  it("names why a session ended", () => {
    const view = sessionView(
      sessionState({ status: "left", reason: "room-closed" }),
      NOW,
    );

    expect(view.text.key).toBe("status.ended.room-closed");
  });
});

describe("the voice panel's buttons", () => {
  it("show what the player's own state is", () => {
    const view = panelView(localState({ muted: true, deafened: true }));

    expect(view.mute).toEqual({ pressed: true, disabled: false });
    expect(view.deafen).toEqual({ pressed: true, disabled: false });
    expect(view.video).toEqual({ pressed: true, disabled: false });
  });

  it("can't unmute or show video against a GM's block", () => {
    const view = panelView(
      localState({
        muted: true,
        videoEnabled: false,
        canPublish: { audio: false, video: false },
      }),
    );

    expect(view.mute).toEqual({ pressed: true, disabled: true });
    expect(view.video).toEqual({ pressed: false, disabled: true });
  });

  it("show video as off while the camera is held for an effect", () => {
    const view = panelView(localState({ cameraHold: "effect-starting" }));

    expect(view.video).toEqual({ pressed: false, disabled: false });
    expect(view.warnings).toEqual(["camera-held"]);
  });

  it("lists every warning the player must see", () => {
    const view = panelView(
      localState({
        openMic: true,
        speakingWhileMuted: true,
        microphoneError: "NotAllowedError",
        cameraError: "NotFoundError",
        effects: {
          rnnoise: { status: "failed", error: "Error" },
          blur: { status: "running", error: null },
        },
      }),
    );

    expect(view.warnings).toEqual([
      "open-mic",
      "speaking-while-muted",
      "microphone-error",
      "camera-error",
      "effect-failed",
    ]);
  });
});
