// Behaviour checked against Foundry v14 client/av/master.mjs and settings.mjs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAVClient } from "../src/foundry/av-classes.ts";
import type { AVClientSettings } from "../src/foundry/av-settings.ts";
import { createFakeWorld, type FakeWorld } from "../src/foundry/world.ts";

const USERS = [
  { id: "gm", name: "Gamemaster", role: 4 },
  { id: "p1", name: "Player1", role: 2 },
  { id: "p4", name: "Player4", role: 1 },
] as const;

type Call = readonly [string, ...unknown[]];

/** Records what AVMaster asks of it; has a mic and camera unless told not. */
class RecordingClient extends FakeAVClient {
  calls: readonly Call[] = [];
  connectResult = true;
  stream: MediaStream | null = {
    getAudioTracks: () => [{ enabled: true }],
  } as unknown as MediaStream;

  #record(...call: Call): void {
    this.calls = [...this.calls, call];
  }

  override initialize(): Promise<void> {
    this.#record("initialize");
    return Promise.resolve();
  }

  override connect(): Promise<boolean> {
    this.#record("connect");
    return Promise.resolve(this.connectResult);
  }

  override disconnect(): Promise<boolean> {
    this.#record("disconnect");
    return Promise.resolve(true);
  }

  override getLevelsStreamForUser(): MediaStream | null {
    return this.stream;
  }

  override isAudioEnabled(): boolean {
    return true;
  }

  override isVideoEnabled(): boolean {
    return true;
  }

  override toggleAudio(enable: boolean): void {
    this.#record("toggleAudio", enable);
  }

  override toggleBroadcast(broadcast: boolean): void {
    this.#record("toggleBroadcast", broadcast);
  }

  override toggleVideo(enable: boolean): void {
    this.#record("toggleVideo", enable);
  }

  override onSettingsChanged(changed: Readonly<Record<string, unknown>>): void {
    this.#record("onSettingsChanged", changed);
  }
}

async function start(
  userId: string,
  av: Partial<AVClientSettings> = {},
  world: FakeWorld = createFakeWorld({ users: USERS }),
) {
  const client = world.connect(userId, { av });
  client.CONFIG.WebRTC.clientClass = RecordingClient;
  client.runLifecycle();
  await world.settle();
  const master = client.game.webrtc;
  if (!master) throw new Error("no game.webrtc");
  return { world, client, master, rtc: master.client as RecordingClient };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AVMaster#connect (master.mjs connect, #initialize)", () => {
  it("initializes, connects, sets the outbound state and renders the dock", async () => {
    // Arrange / Act
    const { client, rtc, master } = await start("p1", {
      voice: {
        mode: "always",
        pttName: "`",
        pttDelay: 100,
        activityThreshold: -45,
      },
    });

    // Assert
    expect(rtc.calls).toEqual([
      ["initialize"],
      ["connect"],
      ["toggleAudio", true],
      ["toggleVideo", true],
      ["toggleBroadcast", true],
    ]);
    expect(master.connected).toBe(true);
    expect(master.detectionStream).not.toBeNull();
    expect(client.ui.webrtc?.renders).toEqual([{}]);
    expect(client.ui.webrtc?.speaking).toEqual({ p1: true });
  });

  it("starts muted in push to talk and without voice detection", async () => {
    const { rtc, master } = await start("p1");

    expect(rtc.calls.slice(2)).toEqual([
      ["toggleAudio", false],
      ["toggleVideo", true],
      ["toggleBroadcast", false],
    ]);
    expect(master.detectionStream).toBeNull();
  });

  it("does not initialize when the world's A/V mode is disabled", async () => {
    const world = createFakeWorld({ users: USERS, av: { mode: 0 } });
    const { rtc, master } = await start("p1", {}, world);

    expect(rtc.calls).toEqual([]);
    expect(master.connected).toBe(false);
  });

  it("leaves the outbound state alone when the client does not connect", async () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });
    const client = world.connect("p1");
    client.CONFIG.WebRTC.clientClass = class extends RecordingClient {
      override connectResult = false;
    };

    // Act
    client.runLifecycle();
    await world.settle();

    // Assert
    const rtc = client.game.webrtc?.client as RecordingClient;
    expect(rtc.calls).toEqual([["initialize"], ["connect"]]);
  });

  it("denies audio to a player without BROADCAST_AUDIO and blocks per mode", async () => {
    const world = createFakeWorld({ users: USERS, av: { mode: 2 } });
    const { master } = await start("p4", {}, world);

    expect(master.canUserBroadcastAudio("p4")).toBe(false);
    expect(master.canUserShareAudio("p1")).toBe(false);
    expect(master.canUserBroadcastVideo("p1")).toBe(true);
    expect(master.canUserShareVideo("gm")).toBe(true);
    expect(master.canUserBroadcastAudio("nobody")).toBe(false);
    expect(master.canUserShareVideo("nobody")).toBe(false);
  });
});

describe("AVSettings (settings.mjs getUser, set)", () => {
  it("merges defaults, permissions and the other users' activity", async () => {
    // Arrange
    const { world, client } = await start("gm");
    const player = world.connect("p1");
    player.runLifecycle();
    await world.settle();

    // Act
    player.game.user.broadcastActivity({ av: { muted: true, speaking: true } });
    await world.settle();

    // Assert
    expect(client.game.webrtc?.settings.getUser("p1")).toEqual({
      popout: false,
      volume: 1,
      muted: true,
      hidden: false,
      blocked: false,
      canBroadcastAudio: true,
      canBroadcastVideo: true,
      speaking: true,
    });
    expect(client.ui.webrtc?.speaking.p1).toBe(true);
    expect(client.game.webrtc?.settings.getUser("nobody")).toBeNull();
  });

  it("reports the local user muted when the client has no audio", () => {
    const world = createFakeWorld({ users: USERS });
    const client = world.connect("p1");
    client.runLifecycle();

    expect(client.game.webrtc?.settings.getUser("p1")).toMatchObject({
      muted: true,
      hidden: true,
    });
  });

  it("applies a set at once and tells AVMaster in one batch", async () => {
    // Arrange
    const { world, master, rtc } = await start("p1");
    rtc.calls = [];

    // Act
    master.settings.set("client", "users.p1.muted", true);
    master.settings.set("client", "users.gm.volume", 0.5);

    // Assert
    expect(master.settings.get("client", "users.p1.muted")).toBe(true);
    expect(rtc.calls).toEqual([]);
    await world.settle();
    expect(rtc.calls).toEqual([
      ["toggleAudio", false],
      [
        "onSettingsChanged",
        { client: { users: { p1: { muted: true }, gm: { volume: 0.5 } } } },
      ],
    ]);
  });

  it("turns hiding into toggleVideo", async () => {
    const { world, master, rtc } = await start("p1");
    rtc.calls = [];

    master.settings.set("client", "users.p1.hidden", true);
    await world.settle();

    expect(rtc.calls[0]).toEqual(["toggleVideo", false]);
  });

  it("shares world settings set by a GM with every client", async () => {
    // Arrange
    const { world, master } = await start("gm");
    const player = await start("p1", {}, world);
    player.rtc.calls = [];

    // Act
    master.settings.set("world", "mode", 1);
    await world.settle();

    // Assert
    expect(player.master.mode).toBe(1);
    expect(player.master.settings.get("world", "mode")).toBe(1);
    expect(player.rtc.calls).toEqual([
      ["onSettingsChanged", { world: { mode: 1 } }],
    ]);
    expect(() => {
      player.master.settings.set("world", "mode", 3);
    }).toThrow(/may not modify/);
  });

  it("never reconnects on a TURN change, as v14 checks the wrong key", async () => {
    const { world, master, rtc } = await start("gm");
    rtc.calls = [];

    master.settings.set("world", "turn.url", "turn:example");
    await world.settle();

    expect(rtc.calls.map(([name]) => name)).toEqual(["onSettingsChanged"]);
  });
});

describe("voice detection and push to talk (master.mjs)", () => {
  it("broadcasts on detected speech in activity mode, unless muted", async () => {
    // Arrange
    const { master, rtc } = await start("p1", {
      voice: {
        mode: "activity",
        pttName: "`",
        pttDelay: 100,
        activityThreshold: -45,
      },
    });
    rtc.calls = [];

    // Act
    master.reportSpeech(true);
    master.reportSpeech(true);
    master.reportSpeech(false);
    master.settings.set("client", "users.p1.muted", true);
    master.reportSpeech(true);

    // Assert
    expect(rtc.calls).toEqual([
      ["toggleBroadcast", true],
      ["toggleBroadcast", false],
    ]);
  });

  it("never starts detection without an enabled levels track", async () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });
    const client = world.connect("p1", {
      av: {
        voice: {
          mode: "activity",
          pttName: "`",
          pttDelay: 100,
          activityThreshold: -45,
        },
      },
    });
    client.CONFIG.WebRTC.clientClass = class extends RecordingClient {
      override stream = null;
    };
    client.runLifecycle();
    await world.settle();
    const master = client.game.webrtc;
    const rtc = master?.client as RecordingClient;
    rtc.calls = [];

    // Act
    master?.reportSpeech(true);

    // Assert
    expect(master?.detectionStream).toBeNull();
    expect(rtc.calls).toEqual([]);
  });

  it("broadcasts while the key is held, with the release delay", async () => {
    // Arrange
    vi.useFakeTimers();
    const { master, rtc } = await start("p1");
    rtc.calls = [];

    // Act / Assert
    expect(master._onPTTStart()).toBe(true);
    expect(rtc.calls).toEqual([["toggleBroadcast", true]]);
    master._onPTTEnd();
    vi.advanceTimersByTime(99);
    expect(rtc.calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(rtc.calls).toEqual([
      ["toggleBroadcast", true],
      ["toggleBroadcast", false],
    ]);
  });

  it("mutes while the key is held outside push to talk", async () => {
    vi.useFakeTimers();
    const { master, rtc } = await start("p1", {
      voice: {
        mode: "always",
        pttName: "`",
        pttDelay: 50,
        activityThreshold: -45,
      },
    });
    rtc.calls = [];

    master._onPTTStart();
    vi.advanceTimersByTime(50);
    master._onPTTEnd();

    expect(rtc.calls).toEqual([
      ["toggleBroadcast", false],
      ["toggleBroadcast", true],
    ]);
  });

  it("ignores the key until connected, and disconnects through the client", async () => {
    const world = createFakeWorld({ users: USERS, av: { mode: 0 } });
    const { master, rtc } = await start("p1", {}, world);

    expect(master._onPTTStart()).toBe(false);
    expect(master._onPTTEnd()).toBe(false);
    expect(await master.disconnect()).toBe(false);
    expect(rtc.calls).toEqual([]);
  });
});
