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
  lose: (from: number, message: LinkMessage) => boolean = () => false,
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
          if (lose(index, message)) return;
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

  it("keeps a line open while its track comes and goes, without renegotiating", async () => {
    const { polite, impolite, sent } = pair();
    await settle();
    const descriptions = (): number =>
      sent.filter(([, m]) => m.type === "description").length;
    const before = descriptions();

    await polite.link.setTrack("camera", createFakeTrack("video"));
    await settle();
    const shown = sources(impolite);
    await polite.link.setTrack("camera", null);
    await settle();

    expect(shown).toEqual(["camera:video"]);
    expect(sources(impolite)).toEqual([]);
    expect(descriptions()).toBe(before);
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
      sending: ["camera", "microphone"],
    });
    // Right away: the next description brings the real sources back.

    expect(sources(polite)).toEqual([]);
  });

  it("refuses lines the other side never announced", async () => {
    // Arrange: a line beside the link's own, carrying a track it never names
    const { polite, impolite } = pair();
    const hidden = impolite.pc.addTransceiver("video", {
      direction: "sendonly",
    });
    await hidden.sender.replaceTrack(createFakeTrack("video"));

    // Act
    await settle();

    // Assert
    expect(hidden.currentDirection).toBe("inactive");
    expect(sources(polite)).toEqual([]);
  });

  it("sends its sources with each description", async () => {
    const { sent } = pair({
      polite: { microphone: createFakeTrack("audio"), camera: null },
    });
    await settle();

    const descriptions = sent.filter(
      ([from, m]) => from === 0 && m.type === "description",
    );

    expect(descriptions.length).toBeGreaterThan(0);
    for (const [, m] of descriptions) expect(m).toHaveProperty("sources");
  });

  it("recovers lost sources and a lost answer on resync", async () => {
    // Arrange: everything from the polite side is lost for a while
    let losing = false;
    const { polite, impolite } = pair(
      { impolite: { microphone: createFakeTrack("audio"), camera: null } },
      (from) => losing && from === 0,
    );
    await settle();
    losing = true;
    await impolite.link.setTrack("camera", createFakeTrack("video"));
    impolite.link.setRefused("microphone", true);
    polite.link.setRefused("microphone", true);
    await settle();
    losing = false;
    const before = sources(polite);

    // Act
    impolite.link.resync();
    polite.link.resync();
    await settle();

    // Assert
    expect(before).toEqual(["camera:video", "microphone:audio"]);
    expect(impolite.pc.signalingState).toBe("stable");
    expect(polite.pc.signalingState).toBe("stable");
    const line = impolite.pc
      .getTransceivers()
      .find((t) => t.kind === "audio" && t.sender.track !== null);
    expect(line?.currentDirection).toBe("inactive");
  });

  it("stays quiet once closed", async () => {
    const { polite, sent } = pair();
    await settle();
    const count = sent.length;
    const changes = polite.changes;

    polite.link.close();
    polite.pc.dispatchEvent(
      Object.assign(new Event("icecandidate"), { candidate: null }),
    );
    polite.link.receive({
      type: "candidate",
      candidate: { candidate: "c", sdpMid: "0", sdpMLineIndex: 0 },
    });
    await settle();

    expect(sent.length).toBe(count);
    expect(polite.changes).toBe(changes);
    expect(polite.errors).toEqual([]);
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
