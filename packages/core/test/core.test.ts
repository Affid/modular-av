import type { EffectDefinition } from "@modular-av/api";
import { createFakeVideoElement } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALWAYS,
  createTable,
  heard,
  master,
  micEnabled,
  micOf,
} from "./table.ts";

const ROOM = "test-world";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("joining with a GM-relayed token", () => {
  it("lets players hear and see each other through Foundry's dock", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });

    // Act
    await table.settle();

    // Assert
    expect([...table.hub.participants(ROOM)].sort()).toEqual(["gm", "p1"]);
    expect(p1.api.state.get().session.status).toBe("connected");
    expect(heard(p1, gm)).not.toBeNull();
    expect(heard(gm, p1)).not.toBeNull();
    const element = createFakeVideoElement();
    await master(p1).client.setUserVideo("gm", element);
    expect(p1.env.shownOn(element)).toEqual([
      gm.core.controller().local.camera,
    ]);
    expect([...master(p1).client.getConnectedUsers()].sort()).toEqual([
      "gm",
      "p1",
    ]);
    expect([gm.errors, p1.errors]).toEqual([[], []]);
  });

  it("gives Foundry's dock video-only streams, since the core plays audio", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    const stream = master(p1).client.getMediaStreamForUser("gm");

    expect(stream?.getAudioTracks()).toEqual([]);
    expect(stream?.getVideoTracks()).toHaveLength(1);
  });

  it("shows the participants with Foundry names in the state", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    const { participants } = p1.api.state.get();

    expect(participants.gm).toMatchObject({
      name: "Gamemaster",
      isGM: true,
      connected: true,
      hasAudio: true,
      hasVideo: true,
    });
    expect(participants.p1).toMatchObject({ isLocal: true, connected: true });
  });

  it("shows each participant's connection quality as the service reports it", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    const before = p1.api.state.get().participants.gm?.quality;

    // Act
    table.hub.setQuality("p1", "gm", "poor");
    await table.settle();

    // Assert
    expect(before).toBeNull();
    expect(p1.api.state.get().participants.gm?.quality).toBe("poor");
    table.hub.loseConnection("p1");
    await table.settle();
    expect(p1.api.state.get().participants.gm?.quality).toBeNull();
  });

  it("waits for a GM, says so, and joins when one logs in", async () => {
    // Arrange
    const table = createTable();
    const p1 = table.join("p1");

    // Act
    await table.settle();
    await vi.advanceTimersByTimeAsync(5000);

    // Assert
    expect(p1.api.state.get().session.status).toBe("waiting-for-gm");
    expect(p1.client.notifications.map((n) => n.message)).toContain(
      "Voice and video: waiting for a GM to let you join.",
    );
    table.join("gm", { secret: true });
    await table.settle();
    expect(p1.api.state.get().session.status).toBe("connected");
  });

  it("warns a GM whose browser lacks the service secret", async () => {
    const table = createTable();

    const gm = table.join("gm");
    await table.settle();

    expect(gm.client.notifications).toContainEqual({
      type: "warn",
      message: expect.stringContaining("enter the service's key") as string,
    });
  });

  it("ends with a plain message when no service module is enabled", async () => {
    const table = createTable();

    const p1 = table.join("p1", { noService: true });
    await table.settle();

    expect(p1.api.state.get().session).toMatchObject({
      status: "left",
      reason: "no-service",
    });
    expect(p1.client.notifications.at(-1)?.type).toBe("error");
  });
});

describe("mute in every state", () => {
  it("keeps a muted mic silent while waiting, connecting, resuming and retrying", async () => {
    // Arrange
    const table = createTable();
    const p1 = table.join("p1", { av: ALWAYS });
    await p1.api.commands.setMuted(true);
    const seen: (boolean | undefined)[] = [];
    p1.api.state.subscribe(
      (s) => s.session.status,
      () => seen.push(micEnabled(p1)),
    );

    // Act
    await table.settle();
    await vi.advanceTimersByTimeAsync(5000);
    table.join("gm", { secret: true });
    await table.settle();
    table.hub.startOutage("p1");
    await table.settle();
    table.hub.loseConnection("p1");
    await table.settle();
    await vi.advanceTimersByTimeAsync(1000);
    await table.settle();

    // Assert
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.every((enabled) => enabled === false)).toBe(true);
    expect(table.hub.isMuted("p1", "microphone")).toBe(true);
  });

  it("shows another player's mute once Foundry reports it, with nothing else changing", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const p1Settings = master(p1).settings;

    // Act: only Foundry's activity broadcast reaches the GM.
    p1Settings.set("client", "users.p1.muted", true);
    p1.client.game.user.broadcastActivity({ av: { muted: true } });
    await table.settle();

    // Assert
    expect(gm.api.state.get().participants.p1?.muted).toBe(true);
  });

  it("ignores Foundry activity that isn't about A/V", async () => {
    const table = createTable();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const refresh = vi.spyOn(gm.core.controller(), "refresh");

    p1.client.game.user.broadcastActivity({ cursor: { x: 1, y: 2 } });
    await table.settle();
    const forCursor = refresh.mock.calls.length;
    p1.client.game.user.broadcastActivity({ av: { hidden: true } });
    await table.settle();

    expect(forCursor).toBe(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-enables the mic after an unmute in always mode", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    await p1.api.commands.setMuted(true);
    await table.settle();
    await p1.api.commands.setMuted(false);
    await table.settle();

    expect(micEnabled(p1)).toBe(true);
    expect(table.hub.isMuted("p1", "microphone")).toBe(false);
  });

  it("sends only while push to talk is held", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    expect(micEnabled(p1)).toBe(false);

    master(p1)._onPTTStart();
    expect(micEnabled(p1)).toBe(true);
    master(p1)._onPTTEnd();
    await vi.advanceTimersByTimeAsync(100);

    expect(micEnabled(p1)).toBe(false);
  });

  it("keeps the core's mute when a service re-enables the track itself", async () => {
    // Arrange: like LiveKit, unmute() sets track.enabled = true when done.
    const table = createTable();
    table.join("gm", { secret: true });
    const definition = table.hub.definition();
    const p1 = table.join("p1", {
      av: ALWAYS,
      service: {
        ...definition,
        canSignTokens: () => false,
        create: async (context) => {
          const connection = await definition.create(context);
          return {
            ...connection,
            setMuted: async (published, muted) => {
              await connection.setMuted(published, muted);
              await vi.advanceTimersByTimeAsync(0);
              const mic = p1.core.controller().local.microphone;
              if (!muted && mic && published.source === "microphone")
                mic.enabled = true;
            },
          };
        },
      },
    });
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Act
    await p1.api.commands.setMuted(false);
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Assert
    expect(micEnabled(p1)).toBe(false);
  });

  it("refuses to unmute a player the GM blocked", async () => {
    const table = createTable();
    const p4 = table.join("p4");
    await table.settle();

    await expect(p4.api.commands.setMuted(false)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(p4.api.commands.setVideoEnabled(true)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("reconnecting", () => {
  it("reconnects once after a loss and not during a resume", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    const statuses: string[] = [];
    p1.api.state.subscribe(
      (s) => s.session.status,
      (status) => statuses.push(status),
    );

    // Act
    table.hub.startOutage("p1");
    await table.settle();
    table.hub.endOutage("p1");
    await table.settle();
    table.hub.loseConnection("p1");
    await table.settle();
    await vi.advanceTimersByTimeAsync(1000);
    await table.settle();

    // Assert
    expect(statuses).toEqual([
      "resuming",
      "connected",
      "retrying",
      "waiting-for-token",
      "connecting",
      "connected",
    ]);
    expect(p1.client.notifications.map((n) => n.message)).toEqual(
      expect.arrayContaining([
        "Voice and video: connection lost, reconnecting…",
        "Voice and video reconnected.",
      ]),
    );
  });

  it("lets the newer tab win and stops the older one for good", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const older = table.join("p1");
    await table.settle();

    const newer = table.join("p1");
    await table.settle();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(older.api.state.get().session).toMatchObject({
      status: "left",
      reason: "joined-elsewhere",
    });
    expect(newer.api.state.get().session.status).toBe("connected");
    expect(older.client.notifications.at(-1)?.message).toBe(
      "Voice and video continued in another tab or window.",
    );
  });

  it("leaves on purpose and rejoins on request", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    await p1.api.commands.leave();
    await table.settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(table.hub.participants(ROOM)).toEqual(["gm"]);
    await p1.api.commands.rejoin();
    await table.settle();

    expect([...table.hub.participants(ROOM)].sort()).toEqual(["gm", "p1"]);
  });
});

describe("GM authority", () => {
  it("blocks a player's audio at once, in new tokens and on every receiver", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    expect(heard(gm, p1)).not.toBeNull();

    // Act
    await gm.api.commands.setBroadcastPermissions("p1", { audio: false });

    // Assert
    expect(micEnabled(p1)).toBe(false);
    expect(heard(gm, p1)).toBeNull();
    await table.settle();
    expect(p1.api.state.get().session.status).toBe("connected");
    expect(p1.api.state.get().local.canPublish).toEqual({
      audio: false,
      video: true,
    });
  });

  it("rejoins with new rights when the GM changes them", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    const statuses: string[] = [];
    p1.api.state.subscribe(
      (s) => s.session.status,
      (status) => statuses.push(status),
    );

    table.world.updateUser("p1", { permissions: { BROADCAST_VIDEO: false } });
    await table.settle();
    table.world.updateUser("p1", { name: "Renamed" });
    p1.client.Hooks.callAll("updateSetting", { key: "core.permissions" });
    await table.settle();

    expect(statuses).toEqual(["waiting-for-token", "connecting", "connected"]);
    expect(p1.api.state.get().participants.p1?.name).toBe("Renamed");
  });

  it("refuses a blocked player's media even if it still arrives", async () => {
    const table = createTable();
    const gm = table.join("gm", { secret: true });
    table.join("p1");
    await table.settle();
    const element = createFakeVideoElement();
    await master(gm).client.setUserVideo("p1", element);
    expect(gm.env.shownOn(element)).toHaveLength(1);

    table.world.updateUser("p1", { permissions: { BROADCAST_VIDEO: false } });

    expect(gm.env.shownOn(element)).toEqual([]);
  });

  it("only lets GMs change permissions", async () => {
    const table = createTable();
    const p1 = table.join("p1");

    await expect(
      p1.api.commands.setBroadcastPermissions("p4", { audio: true }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const gm = table.join("gm");
    await expect(
      gm.api.commands.setBroadcastPermissions("nobody", { audio: true }),
    ).rejects.toMatchObject({ code: "unknown-participant" });
  });
});

describe("deafen and volume", () => {
  it("stops playback and the mic when deafened, and tells the others", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    // Act
    await p1.api.commands.setDeafened(true);
    await table.settle();

    // Assert
    expect(heard(p1, gm)).toBeNull();
    expect(micEnabled(p1)).toBe(false);
    expect(gm.api.state.get().participants.p1?.deafened).toBe(true);
    await p1.api.commands.setDeafened(false);
    expect(heard(p1, gm)).not.toBeNull();
  });

  it("sets a player's volume through Foundry's settings and checks it", async () => {
    const table = createTable();
    const gm = table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    await p1.api.commands.setVolume("gm", 0.25);

    const output = p1.env.outputs.find((o) => o.state.track === micOf(gm));
    expect(output?.state.volume).toBe(0.25);
    expect(master(p1).settings.client.users.gm?.volume).toBe(0.25);
    await expect(p1.api.commands.setVolume("gm", 2)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(p1.api.commands.setVolume("x", 1)).rejects.toMatchObject({
      code: "unknown-participant",
    });
  });
});

describe("Foundry's world mode", () => {
  it("captures no camera in audio-only worlds", async () => {
    const table = createTable({ av: { mode: 1 } });

    const p1 = table.join("p1");
    await table.settle();

    expect(p1.env.captures).toEqual(["audio:default"]);
  });

  it("stays idle with A/V disabled", async () => {
    const table = createTable({ av: { mode: 0 } });

    const p1 = table.join("p1");
    await table.settle();

    expect(p1.env.captures).toEqual([]);
    expect(p1.api.state.get().session.status).toBe("idle");
  });

  it("stops and releases devices when a GM disables A/V", async () => {
    const table = createTable();
    const gm = table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();

    master(gm).settings.set("world", "mode", 0);
    await table.settle();

    expect(p1.api.state.get().session.status).toBe("idle");
    expect(micOf(p1)).toBeNull();
  });
});

describe("registration and plain status", () => {
  it("rejects a service registered after the hook", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    expect(() => {
      p1.api.services.register({ ...table.hub.definition(), id: "late" });
    }).toThrow(/registered too late/);
  });

  it("takes effects in the register hook, and rejects them afterwards", async () => {
    // Arrange
    const table = createTable();
    const effect: EffectDefinition = {
      id: "rnnoise",
      kind: "audio",
      label: "RNNoise",
      stage: "denoise",
      exclusiveGroup: "noise-suppression",
      cost: "light",
      isSupported: () => true,
      create: () => Promise.reject(new Error("not used")),
    };

    // Act
    const p1 = table.join("p1", { effects: [effect] });
    await table.settle();

    // Assert
    expect(p1.api.effects.list()).toEqual([effect]);
    expect(() => {
      p1.api.effects.register({ ...effect, id: "late" });
    }).toThrow(/effects: "late" registered too late/);
  });

  it("tells the player when the microphone is denied", async () => {
    const table = createTable();

    const p1 = table.join("p1", { deny: { audio: "NotAllowedError" } });
    await table.settle();

    expect(p1.api.state.get().local.microphoneError).toBe("NotAllowedError");
    expect(p1.client.notifications.map((n) => n.message)).toContain(
      "Voice and video: your microphone can't be used. Check this site's microphone permission in the browser.",
    );
  });

  it("resolves asset URLs through Foundry's route", () => {
    const table = createTable();
    const p1 = table.join("p1");

    expect(p1.api.assetUrl("modular-av", "worklets/gate.js")).toBe(
      "/modules/modular-av/worklets/gate.js",
    );
  });
});
