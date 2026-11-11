import {
  createFakeTrack,
  createFakeVideoElement,
  endFakeTrack,
  fakeTrackInfo,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable, type Tab, type Table } from "./table.ts";

const ROOM = "test-world";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** The screen `viewer` shows for `sharer`, through `media.attach`. */
function shownScreen(viewer: Tab, sharer: string): readonly MediaStreamTrack[] {
  const element = createFakeVideoElement();
  viewer.api.media.attach(sharer, "screen", element);
  return viewer.env.shownOn(element);
}

/** The screen's sound `listener` plays, if any. */
function heardScreen(listener: Tab, sharer: Tab): MediaStreamTrack | null {
  const sound = sharer.env.displayCaptures.at(-1)?.audio ?? null;
  if (!sound) return null;
  return (
    listener.env.outputs.find((o) => o.state.track === sound)?.state.track ??
    null
  );
}

async function inCall(table: Table = createTable()): Promise<{
  table: Table;
  gm: Tab;
  p1: Tab;
}> {
  const gm = table.join("gm", { secret: true });
  const p1 = table.join("p1");
  await table.settle();
  return { table, gm, p1 };
}

describe("sharing a screen", () => {
  it("shows the shared screen to the others, apart from the camera", async () => {
    // Arrange
    const { table, gm, p1 } = await inCall();

    // Act
    await p1.api.commands.startScreenShare();
    await table.settle();

    // Assert
    const shared = p1.env.displayCaptures[0]?.video;
    expect(shared).toBeDefined();
    expect(shownScreen(gm, "p1")).toEqual([shared]);
    expect(gm.api.state.get().participants.p1).toMatchObject({
      hasScreen: true,
      hasVideo: true,
    });
    expect(p1.api.state.get().local.screenShare).toMatchObject({
      active: true,
      audio: false,
    });
    expect(p1.api.state.get().participants.p1?.hasScreen).toBe(true);
    expect([gm.errors, p1.errors]).toEqual([[], []]);
  });

  it("shows the share of a player whose camera is off", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.setVideoEnabled(false);
    await table.settle();

    await p1.api.commands.startScreenShare();
    await table.settle();

    expect(gm.api.state.get().participants.p1).toMatchObject({
      hidden: true,
      hasScreen: true,
    });
    expect(shownScreen(gm, "p1")).toEqual([p1.env.displayCaptures[0]?.video]);
  });

  it("plays a shared tab's sound while the sharer's microphone is muted", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.setMuted(true);
    await table.settle();

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    expect(gm.api.state.get().participants.p1?.muted).toBe(true);
    expect(heardScreen(gm, p1)).not.toBeNull();
  });

  it("shows the player their own share", async () => {
    const { table, p1 } = await inCall();

    await p1.api.commands.startScreenShare();
    await table.settle();

    expect(shownScreen(p1, "p1")).toEqual([p1.env.displayCaptures[0]?.video]);
  });

  it("shares the screen's sound when asked, and the others hear it", async () => {
    const { table, gm, p1 } = await inCall();

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    expect(p1.env.displayCaptures[0]?.audio).not.toBeNull();
    expect(heardScreen(gm, p1)).not.toBeNull();
    expect(p1.api.state.get().local.screenShare.audio).toBe(true);
  });

  it("shares no sound when the picked screen has none", async () => {
    const { table, p1 } = await inCall();
    p1.env.setDisplayAudio(false);

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    expect(p1.api.state.get().local.screenShare).toMatchObject({
      active: true,
      audio: false,
    });
  });

  it("stops when the player stops it, and frees the screen", async () => {
    // Arrange
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();
    const shared = p1.env.displayCaptures[0];

    // Act
    await p1.api.commands.stopScreenShare();
    await table.settle();

    // Assert
    expect(gm.api.state.get().participants.p1?.hasScreen).toBe(false);
    expect(shownScreen(gm, "p1")).toEqual([]);
    expect(heardScreen(gm, p1)).toBeNull();
    expect(shared && fakeTrackInfo(shared.video).readyState).toBe("ended");
    expect(shared?.audio && fakeTrackInfo(shared.audio).readyState).toBe(
      "ended",
    );
    expect(p1.api.state.get().local.screenShare.active).toBe(false);
  });

  it("stops when the browser's own stop button ends it", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();

    const shared = p1.env.displayCaptures[0];
    if (shared) endFakeTrack(shared.video);
    await table.settle();

    expect(gm.api.state.get().participants.p1?.hasScreen).toBe(false);
    expect(p1.api.state.get().local.screenShare.active).toBe(false);
  });

  it("replaces a running share with the new one", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();

    await p1.api.commands.startScreenShare();
    await table.settle();

    const [first, second] = p1.env.displayCaptures;
    expect(first && fakeTrackInfo(first.video).readyState).toBe("ended");
    expect(shownScreen(gm, "p1")).toEqual([second?.video]);
  });

  it("keeps the share when the picker is closed for a new one", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();
    p1.env.setDenied("display", "NotAllowedError");

    await expect(p1.api.commands.startScreenShare()).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    await table.settle();

    expect(shownScreen(gm, "p1")).toEqual([p1.env.displayCaptures[0]?.video]);
  });

  it("rejects with the browser's error when the picker is closed", async () => {
    const { p1 } = await inCall();
    p1.env.setDenied("display", "NotAllowedError");

    await expect(p1.api.commands.startScreenShare()).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    expect(p1.api.state.get().local.screenShare.active).toBe(false);
  });

  it("stops the share when the player leaves the call", async () => {
    const { table, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();

    await p1.api.commands.leave();
    await table.settle();

    const shared = p1.env.displayCaptures[0];
    expect(shared && fakeTrackInfo(shared.video).readyState).toBe("ended");
    expect(p1.api.state.get().local.screenShare.active).toBe(false);
  });

  it("shares again after the connection comes back", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();

    table.hub.loseConnection("p1");
    await vi.advanceTimersByTimeAsync(1000);
    await table.settle();

    expect(table.hub.participants(ROOM)).toContain("p1");
    expect(shownScreen(gm, "p1")).toEqual([p1.env.displayCaptures[0]?.video]);
  });
});

describe("what a player may share", () => {
  it("is available in a call whose service carries it", async () => {
    const { p1 } = await inCall();

    expect(p1.api.state.get().local.screenShare).toEqual({
      active: false,
      audio: false,
      available: true,
      audioAvailable: true,
      rule: "video",
    });
  });

  it("refuses outside a call", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    await expect(p1.api.commands.startScreenShare()).rejects.toMatchObject({
      code: "not-ready",
    });
    expect(p1.env.displayCaptures).toEqual([]);
    expect(p1.api.state.get().local.screenShare.available).toBe(false);
  });

  it("refuses when the service carries no screen share", async () => {
    const { p1 } = await inCall(createTable({}, { screenShare: null }));

    await expect(p1.api.commands.startScreenShare()).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(p1.api.state.get().local.screenShare.available).toBe(false);
  });

  it("asks for no sound when the service carries none", async () => {
    const { table, p1 } = await inCall(
      createTable({}, { screenShare: { audio: false } }),
    );

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    expect(p1.env.displayCaptures[0]?.audio).toBeNull();
    expect(p1.api.state.get().local.screenShare).toMatchObject({
      active: true,
      audio: false,
      audioAvailable: false,
    });
  });

  it("refuses a player the GM took video from", async () => {
    const { table, p1 } = await inCall();
    table.world.updateUser("p1", { permissions: { BROADCAST_VIDEO: false } });
    await table.settle();

    await expect(p1.api.commands.startScreenShare()).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(p1.env.displayCaptures).toEqual([]);
  });

  it("stops a share when the GM takes video away", async () => {
    // Arrange
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();
    const shared = p1.env.displayCaptures[0];

    // Act
    table.world.updateUser("p1", { permissions: { BROADCAST_VIDEO: false } });
    await table.settle();

    // Assert
    expect(shared && fakeTrackInfo(shared.video).readyState).toBe("ended");
    expect(gm.api.state.get().participants.p1?.hasScreen).toBe(false);
    expect(p1.api.state.get().local.screenShare.active).toBe(false);
  });

  it("keeps the screen's sound off when the GM took the player's audio", async () => {
    const { table, gm, p1 } = await inCall();
    await gm.api.commands.setBroadcastPermissions("p1", { audio: false });
    await table.settle();

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    expect(p1.env.displayCaptures[0]?.audio).toBeNull();
    expect(gm.api.state.get().participants.p1?.hasScreen).toBe(true);
  });

  it("lets only GMs share when the GM chose so", async () => {
    // Arrange
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();

    // Act
    await gm.client.game.settings.set("modular-av", "screenShare", "gm");
    await table.settle();

    // Assert
    expect(p1.api.state.get().local.screenShare).toMatchObject({
      active: false,
      available: false,
      rule: "gm",
    });
    expect(gm.api.state.get().local.screenShare.available).toBe(true);
    await expect(p1.api.commands.startScreenShare()).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("lets nobody share when the GM chose so", async () => {
    const { table, gm } = await inCall();

    await gm.client.game.settings.set("modular-av", "screenShare", "nobody");
    await table.settle();

    await expect(gm.api.commands.startScreenShare()).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("refuses a share from someone the rule leaves out, even if it arrives", async () => {
    // Arrange: a service with no token (P2P), where receivers are the only
    // check, and a sharer whose browser misbehaves.
    const table = createTable({}, { needsToken: false });
    const gm = table.join("gm");
    const p1 = table.join("p1");
    await table.settle();
    await gm.client.game.settings.set("modular-av", "screenShare", "gm");
    await table.settle();
    const element = createFakeVideoElement();
    gm.api.media.attach("p1", "screen", element);

    // Act
    const connection = p1.core.controller().connection();
    await connection?.publish(createFakeTrack("video"), "screen");
    await connection?.publish(createFakeTrack("audio"), "screen-audio");
    await table.settle();

    // Assert
    expect(gm.env.shownOn(element)).toEqual([]);
    expect(gm.env.outputs.filter((o) => o.state.track)).toHaveLength(1);
    expect(gm.api.state.get().participants.p1?.hasScreen).toBe(false);
  });

  it("hides the share of someone this player hid", async () => {
    const { table, gm, p1 } = await inCall();
    await p1.api.commands.startScreenShare();
    await table.settle();

    await gm.api.commands.setHiddenByMe("p1", true);
    await table.settle();

    expect(shownScreen(gm, "p1")).toEqual([]);
    expect(gm.api.state.get().participants.p1?.hasScreen).toBe(false);
  });
});

describe("the screen share right in tokens", () => {
  it("lets a token publish a screen only under the world's rule", async () => {
    const { table, gm, p1 } = await inCall();
    const statuses: string[] = [];
    p1.api.state.subscribe(
      (s) => s.session.status,
      (status) => statuses.push(status),
    );

    await gm.client.game.settings.set("modular-av", "screenShare", "nobody");
    await table.settle();

    expect(statuses).toEqual(["waiting-for-token", "connecting", "connected"]);
  });
});
