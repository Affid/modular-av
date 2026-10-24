import { fakeTrackInfo } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, createTable, micOf, type Tab } from "./table.ts";

const cameraOf = (tab: Tab): MediaStreamTrack | null =>
  tab.core.controller().local.camera;

const videoCaptures = (tab: Tab): number =>
  tab.env.captures.filter((c) => c.startsWith("video:")).length;

const ended = (track: MediaStreamTrack | null): boolean =>
  track !== null && fakeTrackInfo(track).readyState === "ended";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the camera runs only while video can go out", () => {
  it("stops the camera device when the player hides, and starts it on show", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    const camera = cameraOf(p1);

    // Act
    await p1.api.commands.setVideoEnabled(false);
    await table.settle();
    const hidden = cameraOf(p1);
    await p1.api.commands.setVideoEnabled(true);
    await table.settle();

    // Assert
    expect(camera).not.toBeNull();
    expect(hidden).toBeNull();
    expect(ended(camera)).toBe(true);
    expect(cameraOf(p1)).not.toBeNull();
    expect(videoCaptures(p1)).toBe(2);
  });

  it("stops the camera while the GM blocks the player's video", async () => {
    const table = createTable();
    const gm = table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    const camera = cameraOf(p1);

    await gm.api.commands.setBroadcastPermissions("p1", { video: false });
    await table.settle();
    const blocked = cameraOf(p1);
    await gm.api.commands.setBroadcastPermissions("p1", { video: true });
    await table.settle();

    expect(blocked).toBeNull();
    expect(ended(camera)).toBe(true);
    expect(cameraOf(p1)).not.toBeNull();
  });

  it("frees the camera and the microphone when the player leaves, and takes them on rejoin", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const [camera, mic] = [cameraOf(p1), micOf(p1)];

    await p1.api.commands.leave();
    await table.settle();
    const left = [cameraOf(p1), micOf(p1)];
    const audioRunning = p1.env.captureContexts[0]?.running;
    await p1.api.commands.rejoin();
    await table.settle();

    expect(left).toEqual([null, null]);
    expect(ended(camera)).toBe(true);
    expect(mic).not.toBeNull();
    expect(audioRunning).toBe(false);
    expect(cameraOf(p1)).not.toBeNull();
    expect(micOf(p1)).not.toBeNull();
  });

  it("frees both when another tab of the player took over", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const first = table.join("p1");
    await table.settle();

    table.join("p1");
    await table.settle();

    expect(first.api.state.get().session.reason).toBe("joined-elsewhere");
    expect([cameraOf(first), micOf(first)]).toEqual([null, null]);
  });

  it("keeps the microphone while muted: an unmute is instant", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const mic = micOf(p1);

    await p1.api.commands.setMuted(true);
    await table.settle();

    expect(micOf(p1)).toBe(mic);
    expect(p1.env.captures.filter((c) => c.startsWith("audio:"))).toHaveLength(
      1,
    );
  });
});
