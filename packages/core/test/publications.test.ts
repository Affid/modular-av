import type { ServiceConnection, TrackSource } from "@modular-av/api";
import { createFakeTrack, createMockServiceHub } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { createPublications } from "../src/session/publications.ts";

async function connected(): Promise<ServiceConnection> {
  const hub = createMockServiceHub();
  const connection = await hub.definition().create({ participant: "p1" });
  await connection.connect(
    { name: "room" },
    hub.signToken({
      participant: "p1",
      room: "room",
      canPublish: { audio: true, video: true, screen: true },
      ttlSeconds: 60,
    }),
    new AbortController().signal,
  );
  return connection;
}

const NONE = {
  microphone: null,
  camera: null,
  screen: null,
  screenAudio: null,
} as const;

function recording(real: ServiceConnection): {
  connection: ServiceConnection;
  live: () => readonly TrackSource[];
  mutes: () => readonly [TrackSource, boolean][];
} {
  let live: readonly TrackSource[] = [];
  let mutes: readonly [TrackSource, boolean][] = [];
  const connection: ServiceConnection = {
    ...real,
    publish: async (track, source) => {
      const published = await real.publish(track, source);
      live = [...live, source];
      return published;
    },
    unpublish: async (published) => {
      await real.unpublish(published);
      live = live.filter((s) => s !== published.source);
    },
    setMuted: async (published, muted) => {
      await real.setMuted(published, muted);
      mutes = [...mutes, [published.source, muted]];
    },
  };
  return { connection, live: () => live, mutes: () => mutes };
}

describe("publications", () => {
  it("publishes a screen and its sound under the screen right", async () => {
    // Arrange
    const { connection, live, mutes } = recording(await connected());
    const publications = createPublications(connection);
    const tracks = {
      ...NONE,
      screen: createFakeTrack("video"),
      screenAudio: createFakeTrack("audio"),
    };

    // Act
    await publications.sync(
      tracks,
      { audio: true, video: true, screen: true },
      { audio: false, video: false },
    );

    // Assert
    expect(live()).toEqual(["screen", "screen-audio"]);
    expect(mutes()).toEqual([
      ["screen", false],
      ["screen-audio", false],
    ]);
  });

  it("publishes no screen without the screen right, and no sound without audio", async () => {
    const { connection, live } = recording(await connected());
    const publications = createPublications(connection);
    const tracks = {
      ...NONE,
      screen: createFakeTrack("video"),
      screenAudio: createFakeTrack("audio"),
    };

    await publications.sync(
      tracks,
      { audio: true, video: true },
      { audio: true, video: true },
    );
    const withoutRight = live();
    await publications.sync(
      tracks,
      { audio: false, video: true, screen: true },
      { audio: false, video: true },
    );

    expect(withoutRight).toEqual([]);
    expect(live()).toEqual(["screen"]);
  });

  it("stops publishing a screen that stopped", async () => {
    const { connection, live } = recording(await connected());
    const publications = createPublications(connection);
    const rights = { audio: true, video: true, screen: true };
    const outbound = { audio: true, video: true };
    await publications.sync(
      { ...NONE, screen: createFakeTrack("video") },
      rights,
      outbound,
    );

    await publications.sync(NONE, rights, outbound);

    expect(live()).toEqual([]);
  });

  it("publishes the camera even when the microphone fails", async () => {
    // Arrange
    const real = await connected();
    const published: TrackSource[] = [];
    const connection: ServiceConnection = {
      ...real,
      publish: (track, source) => {
        if (source === "microphone")
          return Promise.reject(new Error("mic refused"));
        published.push(source);
        return real.publish(track, source);
      },
    };
    const publications = createPublications(connection);
    const tracks = {
      ...NONE,
      microphone: createFakeTrack("audio"),
      camera: createFakeTrack("video"),
    };

    // Act
    const sync = publications.sync(
      tracks,
      { audio: true, video: true },
      { audio: true, video: true },
    );

    // Assert
    await expect(sync).rejects.toThrow(/mic refused/);
    expect(published).toEqual(["camera"]);
  });
});
