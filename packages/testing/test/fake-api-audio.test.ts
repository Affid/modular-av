import { describe, expect, it } from "vitest";
import { createFakeApi, createFakeTrack } from "../src/index.ts";

describe("the fake API's audio subscriptions", () => {
  it("records them and feeds only the active ones that match", () => {
    // Arrange
    const api = createFakeApi();
    const received: (MediaStreamTrack | null)[] = [];
    const off = api.media.audio("transcriber", "p1", "microphone", (t) =>
      received.push(t),
    );
    api.media.audio("transcriber", "p1", "screen", () => {
      throw new Error("not this source");
    });
    const track = createFakeTrack("audio");

    // Act
    api.emitAudio("p1", "microphone", track);
    off();
    api.emitAudio("p1", "microphone", null);

    // Assert
    expect(received).toEqual([track]);
    expect(api.audioSubscriptions).toEqual([
      {
        moduleId: "transcriber",
        participant: "p1",
        source: "microphone",
        active: false,
      },
      {
        moduleId: "transcriber",
        participant: "p1",
        source: "screen",
        active: true,
      },
    ]);
  });
});
