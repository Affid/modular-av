import { createFakeTrack, FakePeerConnection } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import {
  createLink,
  type Link,
  type LinkMessage,
  type OutgoingTracks,
} from "../src/link.ts";

interface End {
  readonly pc: FakePeerConnection;
  readonly link: Link;
  readonly errors: unknown[];
  changes: number;
}

const NONE: OutgoingTracks = { microphone: null, camera: null };

/** Two links whose messages reach each other in order, a task later. */
function pair(
  tracks: {
    readonly polite?: OutgoingTracks;
    readonly impolite?: OutgoingTracks;
  } = {},
): {
  readonly polite: End;
  readonly impolite: End;
  readonly sent: (readonly [number, LinkMessage])[];
} {
  const ends: End[] = [];
  const sent: (readonly [number, LinkMessage])[] = [];
  for (const index of [0, 1]) {
    const pc = new FakePeerConnection();
    const errors: unknown[] = [];
    const end: End = {
      pc,
      errors,
      changes: 0,
      link: createLink({
        pc,
        polite: index === 0,
        tracks: (index === 0 ? tracks.polite : tracks.impolite) ?? NONE,
        send: (message) => {
          sent.push([index, message]);
          setTimeout(() => {
            ends[1 - index]?.link.receive(message);
          }, 0);
        },
        onChange: () => {
          end.changes += 1;
        },
        onError: (error) => errors.push(error),
      }),
    };
    ends.push(end);
  }
  const [polite, impolite] = ends;
  if (!polite || !impolite) throw new Error("no ends");
  return { polite, impolite, sent };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

const sources = (end: End): string[] =>
  end.link
    .remoteTracks()
    .map((t) => `${t.source}:${t.track.kind}`)
    .sort();

describe("a link", () => {
  it("connects and carries each side's tracks by source", async () => {
    // Arrange
    const mic = createFakeTrack("audio");
    const cam = createFakeTrack("video");

    // Act
    const { polite, impolite } = pair({
      polite: { microphone: mic, camera: cam },
      impolite: { microphone: createFakeTrack("audio"), camera: null },
    });
    await settle();

    // Assert
    expect([polite.link.state, impolite.link.state]).toEqual([
      "connected",
      "connected",
    ]);
    expect(sources(impolite)).toEqual(["camera:video", "microphone:audio"]);
    expect(sources(polite)).toEqual(["microphone:audio"]);
    const senders = polite.pc
      .getTransceivers()
      .map((t) => t.sender.track)
      .filter((t) => t !== null);
    expect(senders).toEqual([mic, cam]);
    expect([polite.errors, impolite.errors]).toEqual([[], []]);
  });

  it("stops and resumes a source with the same remote track", async () => {
    const mic = createFakeTrack("audio");
    const { polite, impolite } = pair({
      polite: { microphone: mic, camera: null },
    });
    await settle();
    const before = impolite.link.remoteTracks()[0]?.track;

    await polite.link.setTrack("microphone", null);
    await settle();
    const stopped = sources(impolite);
    await polite.link.setTrack("microphone", createFakeTrack("audio"));
    await settle();

    expect(stopped).toEqual([]);
    expect(impolite.link.remoteTracks()[0]?.track).toBe(before);
  });

  it("refuses a source by negotiating it inactive, and keeps listing it", async () => {
    // Arrange
    const { polite, impolite } = pair({
      impolite: { microphone: createFakeTrack("audio"), camera: null },
    });
    await settle();
    const sending = (): (string | null)[] =>
      impolite.pc
        .getTransceivers()
        .filter((t) => t.sender.track !== null)
        .map((t) => t.currentDirection);

    // Act
    polite.link.setRefused("microphone", true);
    await settle();
    const refused = sending();
    polite.link.setRefused("microphone", false);
    await settle();

    // Assert
    expect(refused).toEqual(["inactive"]);
    expect(sending()).toEqual(["sendonly"]);
    expect(sources(polite)).toEqual(["microphone:audio"]);
  });

  it("applies a refusal made before the source arrived", async () => {
    const { polite, impolite } = pair();
    polite.link.setRefused("camera", true);
    await settle();

    await impolite.link.setTrack("camera", createFakeTrack("video"));
    await settle();

    const line = impolite.pc
      .getTransceivers()
      .find((t) => t.sender.track !== null);
    expect(line?.currentDirection).toBe("inactive");
  });

  it("ignores sources on the wrong kind of line or on its own lines", async () => {
    const { polite } = pair({
      impolite: { microphone: createFakeTrack("audio"), camera: null },
    });
    await settle();
    const own = polite.pc.getTransceivers().find((t) => t.kind === "video");
    const remoteAudio = polite.pc
      .getTransceivers()
      .find(
        (t) => t.kind === "audio" && t.sender.track === null && t.trackFired,
      );

    polite.link.receive({
      type: "sources",
      sources: {
        [remoteAudio?.mid ?? "x"]: "camera",
        [own?.mid ?? "y"]: "microphone",
      },
    });
    await settle();

    expect(sources(polite)).toEqual([]);
  });

  it("goes down with its path; the impolite side restarts ICE when it failed", async () => {
    // Arrange
    const { polite, impolite } = pair();
    await settle();

    // Act
    polite.pc.cut("failed");
    impolite.pc.cut("failed");
    const down = [polite.link.state, impolite.link.state];
    polite.pc.restore();
    impolite.pc.restore();
    await settle();

    // Assert
    expect(down).toEqual(["down", "down"]);
    expect([polite.pc.restarts, impolite.pc.restarts]).toEqual([0, 1]);
    expect([polite.link.state, impolite.link.state]).toEqual([
      "connected",
      "connected",
    ]);
  });

  it("limits the camera's bitrate once its line is negotiated", async () => {
    const { polite } = pair({
      polite: { microphone: null, camera: createFakeTrack("video") },
    });
    const limits = { maxBitrate: 300_000, scaleResolutionDownBy: 2 };
    await polite.link.limitVideo(limits);
    await settle();

    await polite.link.limitVideo(limits);

    const camera = polite.pc.getTransceivers().find((t) => t.kind === "video");
    expect(camera?.sender.getParameters().encodings).toEqual([
      { active: true, ...limits },
    ]);
  });

  it("reads its stats, takes new ICE servers and closes", async () => {
    // Arrange
    const { polite } = pair();
    await settle();
    polite.pc.stats = { roundTripMs: 80, packetsLost: 0, packetsReceived: 50 };

    // Act
    const stats = await polite.link.stats();
    polite.link.setConfiguration({ iceTransportPolicy: "relay" });
    polite.link.close();

    // Assert
    expect(stats).toEqual({ roundTripMs: 80, packetLoss: 0 });
    expect(polite.pc.configuration).toEqual({ iceTransportPolicy: "relay" });
    expect(polite.pc.restarts).toBe(1);
    expect([polite.link.state, polite.pc.connectionState]).toEqual([
      "closed",
      "closed",
    ]);
  });

  it("tells its owner about changes and sends its sources once each", async () => {
    const { polite, sent } = pair({
      polite: { microphone: createFakeTrack("audio"), camera: null },
    });
    await settle();

    const lists = sent.filter(
      ([from, m]) => from === 0 && m.type === "sources",
    );

    expect(polite.changes).toBeGreaterThan(0);
    expect(new Set(lists.map((m) => JSON.stringify(m))).size).toBe(
      lists.length,
    );
  });
});
