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
      canPublish: { audio: true, video: true },
      ttlSeconds: 60,
    }),
    new AbortController().signal,
  );
  return connection;
}

describe("publications", () => {
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
