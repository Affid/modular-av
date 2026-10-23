// Behaviour checked against Foundry v14 client/av/client.mjs and
// applications/apps/av/cameras.mjs.
import { describe, expect, it } from "vitest";
import {
  FakeAVClient,
  FakeCameraViews,
  FakeDefaultAVClient,
} from "../src/foundry/av-classes.ts";
import { createFakeWorld } from "../src/foundry/world.ts";

const USERS = [{ id: "p1", name: "Player1", role: 2 }] as const;

function master() {
  const client = createFakeWorld({ users: USERS }).connect("p1");
  client.runLifecycle();
  const webrtc = client.game.webrtc;
  if (!webrtc) throw new Error("no game.webrtc");
  return webrtc;
}

describe("AVClient base class", () => {
  it("throws for every method a subclass must define", async () => {
    // Arrange
    const webrtc = master();
    const base = new FakeAVClient(webrtc, webrtc.settings);
    const element = {} as HTMLVideoElement;

    // Act / Assert
    await expect(base.initialize()).rejects.toThrow(/initialize\(\) method/);
    await expect(base.connect()).rejects.toThrow(/connect\(\)/);
    await expect(base.disconnect()).rejects.toThrow(/disconnect\(\)/);
    await expect(base.setUserVideo("p1", element)).rejects.toThrow(
      /setUserVideo\(\)/,
    );
    await expect(base.updateLocalStream()).rejects.toThrow(
      /updateLocalStream\(\)/,
    );
    for (const call of [
      () => base.getConnectedUsers(),
      () => base.getMediaStreamForUser("p1"),
      () => base.getLevelsStreamForUser("p1"),
      () => base.isAudioEnabled(),
      () => base.isVideoEnabled(),
      () => {
        base.toggleAudio(true);
      },
      () => {
        base.toggleBroadcast(true);
      },
      () => {
        base.toggleVideo(true);
      },
    ])
      expect(call).toThrow(/must be defined by an AVClient subclass/);
  });

  it("reads the voice mode and mute from the A/V settings", async () => {
    const webrtc = master();
    const base = new FakeAVClient(webrtc, webrtc.settings);

    expect([
      base.isVoicePTT,
      base.isVoiceAlways,
      base.isVoiceActivated,
    ]).toEqual([true, false, false]);
    expect(base.isMuted).toBe(false);
    webrtc.settings.set("client", "users.p1.muted", true);
    expect(base.isMuted).toBe(true);
    expect(await base.getAudioSinks()).toEqual({});
    expect(await base.getAudioSources()).toEqual({});
    expect(await base.getVideoSources()).toEqual({});
    expect(() => {
      base.onSettingsChanged({});
    }).not.toThrow();
  });

  it("starts as a default client that connects and sends nothing", async () => {
    const webrtc = master();
    const client = new FakeDefaultAVClient(webrtc, webrtc.settings);

    expect(await client.disconnect()).toBe(true);
    expect(client.getConnectedUsers()).toEqual(["p1"]);
    expect(client.getMediaStreamForUser()).toBeNull();
    expect([client.isAudioEnabled(), client.isVideoEnabled()]).toEqual([
      false,
      false,
    ]);
    client.toggleAudio();
    client.toggleBroadcast();
    client.toggleVideo();
    await expect(client.setUserVideo()).resolves.toBeUndefined();
    await expect(client.updateLocalStream()).resolves.toBeUndefined();
  });
});

describe("CameraViews stand-in", () => {
  it("records renders and speaking, and has no video elements", async () => {
    const views = new FakeCameraViews();

    await views.render({ parts: ["p1"] });
    views.setUserIsSpeaking("p1", true);

    expect(views.renders).toEqual([{ parts: ["p1"] }]);
    expect(views.speaking).toEqual({ p1: true });
    expect(views.getUserVideoElement("p1")).toBeNull();
  });
});
