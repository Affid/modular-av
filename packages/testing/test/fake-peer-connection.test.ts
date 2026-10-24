import { describe, expect, it } from "vitest";
import { FakePeerConnection } from "../src/rtc/fake-peer-connection.ts";
import { fakeTrackInfo } from "../src/service/fake-track.ts";

const turns = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

/** One offer from `a`, answered by `b`. */
async function negotiate(
  a: FakePeerConnection,
  b: FakePeerConnection,
): Promise<void> {
  await a.setLocalDescription();
  if (!a.localDescription) throw new Error("no offer");
  await b.setRemoteDescription(a.localDescription);
  await b.setLocalDescription();
  if (!b.localDescription) throw new Error("no answer");
  await a.setRemoteDescription(b.localDescription);
  await turns();
}

function record(pc: FakePeerConnection, type: string): Event[] {
  const events: Event[] = [];
  pc.addEventListener(type, (event) => events.push(event));
  return events;
}

describe("FakePeerConnection", () => {
  it("negotiates media lines, fires tracks and connects", async () => {
    // Arrange
    const a = new FakePeerConnection();
    const b = new FakePeerConnection();
    const needed = record(a, "negotiationneeded");
    const tracks = record(b, "track");
    const sending = a.addTransceiver("audio", { direction: "sendonly" });
    await turns();

    // Act
    await negotiate(a, b);

    // Assert
    expect(needed).toHaveLength(1);
    expect(sending.mid).toBe("0");
    expect(sending.currentDirection).toBe("sendonly");
    const [received] = b.getTransceivers();
    expect(received?.currentDirection).toBe("recvonly");
    expect(tracks).toHaveLength(1);
    expect([a.connectionState, b.connectionState]).toEqual([
      "connected",
      "connected",
    ]);
  });

  it("rolls back its own offer when one arrives (glare)", async () => {
    const a = new FakePeerConnection();
    const b = new FakePeerConnection();
    a.addTransceiver("audio", { direction: "sendonly" });
    const own = b.addTransceiver("video", { direction: "sendonly" });
    await a.setLocalDescription();
    await b.setLocalDescription();

    if (!a.localDescription) throw new Error("no offer");
    await b.setRemoteDescription(a.localDescription);

    expect(b.signalingState).toBe("have-remote-offer");
    expect(own.mid).toBeNull();
  });

  it("asks to negotiate again for new lines and changed directions", async () => {
    const a = new FakePeerConnection();
    const b = new FakePeerConnection();
    a.addTransceiver("audio", { direction: "sendonly" });
    await negotiate(a, b);
    const needed = record(b, "negotiationneeded");

    const [received] = b.getTransceivers();
    if (!received) throw new Error("no transceiver");
    received.direction = "inactive";
    await turns();
    await negotiate(b, a);

    expect(needed).toHaveLength(1);
    expect(a.getTransceivers()[0]?.currentDirection).toBe("inactive");
  });

  it("recovers a disconnected path by itself, a failed one only after a restart", async () => {
    // Arrange
    const a = new FakePeerConnection();
    const b = new FakePeerConnection();
    a.addTransceiver("audio", { direction: "sendonly" });
    await negotiate(a, b);

    // Act / Assert
    a.cut();
    expect(a.connectionState).toBe("disconnected");
    a.restore();
    expect(a.connectionState).toBe("connected");
    a.cut("failed");
    a.restore();
    expect(a.connectionState).toBe("failed");
    a.restartIce();
    await turns();
    await negotiate(a, b);
    expect([a.connectionState, a.restarts]).toEqual(["connected", 1]);
  });

  it("trickles a candidate, then the end, and takes the other side's", async () => {
    const a = new FakePeerConnection();
    const b = new FakePeerConnection();
    const candidates = record(a, "icecandidate");
    a.addTransceiver("audio", { direction: "sendonly" });

    await expect(b.addIceCandidate({ candidate: "c" })).rejects.toThrow(
      /remote description/,
    );
    await negotiate(a, b);
    await b.addIceCandidate({ candidate: "c" });

    const values = candidates.map(
      (e) => (e as Event & { candidate: unknown }).candidate,
    );
    expect(values).toHaveLength(2);
    expect(values[1]).toBeNull();
    expect(b.candidates).toEqual([{ candidate: "c" }]);
  });

  it("refuses an answer without an offer, and everything once closed", async () => {
    const a = new FakePeerConnection();
    const b = new FakePeerConnection();
    a.addTransceiver("video", { direction: "sendonly" });
    await negotiate(a, b);
    const [received] = b.getTransceivers();
    if (!received) throw new Error("no line");

    await expect(
      a.setRemoteDescription({ type: "answer", sdp: '{"lines":[]}' }),
    ).rejects.toThrow(/no offer/);
    b.close();
    b.close();

    expect(b.connectionState).toBe("closed");
    expect(fakeTrackInfo(received.receiver.track).readyState).toBe("ended");
    await expect(b.setLocalDescription()).rejects.toThrow(/closed/);
    await expect(
      b.setRemoteDescription({ type: "offer", sdp: '{"lines":[]}' }),
    ).rejects.toThrow(/closed/);
  });

  it("keeps sender parameters, configuration and scripted stats", async () => {
    const pc = new FakePeerConnection({ iceServers: [] });
    const { sender } = pc.addTransceiver("video", { direction: "sendonly" });

    await sender.setParameters({
      ...sender.getParameters(),
      encodings: [{ maxBitrate: 1000 }],
    });
    pc.setConfiguration({ iceTransportPolicy: "relay" });
    pc.stats = { roundTripMs: 300, packetsLost: 5, packetsReceived: 95 };
    const stats = await pc.getStats();

    expect(sender.getParameters().encodings).toEqual([{ maxBitrate: 1000 }]);
    expect(pc.configuration).toEqual({ iceTransportPolicy: "relay" });
    expect(stats.get("pair")).toMatchObject({ currentRoundTripTime: 0.3 });
    expect(stats.get("in")).toMatchObject({ packetsLost: 5 });
  });
});
