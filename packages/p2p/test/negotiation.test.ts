import { FakePeerConnection } from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CandidateInit, SessionDescription } from "../src/messages.ts";
import {
  createNegotiation,
  type Negotiation,
  POLITE_WAIT_MS,
} from "../src/negotiation.ts";

type Wire =
  | { readonly description: SessionDescription }
  | { readonly candidate: CandidateInit | null };

interface Side {
  readonly pc: FakePeerConnection;
  readonly negotiation: Negotiation;
  readonly errors: unknown[];
  /** The descriptions it sent, in order. */
  readonly sent: string[];
}

/** Two sides whose messages reach each other in order, a turn later. */
function pair(lose: (message: Wire) => boolean = () => false): {
  readonly polite: Side;
  readonly impolite: Side;
} {
  const pcs = [new FakePeerConnection(), new FakePeerConnection()] as const;
  const sides: Side[] = [];
  const deliver = (to: number, message: Wire): void => {
    if (lose(message)) return;
    setTimeout(() => {
      const side = sides[to];
      if (!side) return;
      if ("description" in message)
        void side.negotiation.receiveDescription(message.description);
      else void side.negotiation.receiveCandidate(message.candidate);
    }, 0);
  };
  for (const [index, pc] of pcs.entries()) {
    const errors: unknown[] = [];
    const sent: string[] = [];
    const negotiation = createNegotiation({
      pc,
      polite: index === 0,
      send: (message) => {
        if ("description" in message) sent.push(message.description.type);
        deliver(1 - index, message);
      },
      onError: (error) => errors.push(error),
    });
    sides.push({ pc, negotiation, errors, sent });
  }
  const [polite, impolite] = sides;
  if (!polite || !impolite) throw new Error("no sides");
  return { polite, impolite };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("perfect negotiation", () => {
  it("settles both sides' lines when both offer at once", async () => {
    // Arrange
    const { polite, impolite } = pair();

    // Act
    polite.pc.addTransceiver("audio", { direction: "sendonly" });
    impolite.pc.addTransceiver("audio", { direction: "sendonly" });
    await settle();

    // Assert
    for (const side of [polite, impolite]) {
      expect(side.pc.signalingState).toBe("stable");
      expect(side.pc.connectionState).toBe("connected");
      expect(
        side.pc
          .getTransceivers()
          .map((t) => t.currentDirection)
          .sort(),
      ).toEqual(["recvonly", "sendonly"]);
      expect(side.errors).toEqual([]);
    }
  });

  it("answers first instead of offering at once, when it is the side that gives way", async () => {
    // Arrange: a new link, both sides with lines to send.
    const { polite, impolite } = pair();

    // Act
    polite.pc.addTransceiver("audio", { direction: "sendonly" });
    impolite.pc.addTransceiver("audio", { direction: "sendonly" });
    await settle();

    // Assert: no colliding offers, so nothing is rolled back.
    expect(impolite.sent[0]).toBe("offer");
    expect(polite.sent).toEqual(["answer", "offer"]);
    for (const side of [polite, impolite])
      expect(side.pc.connectionState).toBe("connected");
  });

  it("offers anyway when the other side has nothing to offer", async () => {
    // Arrange
    vi.useFakeTimers();
    const { polite, impolite } = pair();

    // Act
    polite.pc.addTransceiver("audio", { direction: "sendonly" });
    await vi.advanceTimersByTimeAsync(POLITE_WAIT_MS / 2);
    const early = [...polite.sent];
    await vi.advanceTimersByTimeAsync(POLITE_WAIT_MS);

    // Assert
    expect(early).toEqual([]);
    expect(polite.sent).toEqual(["offer"]);
    expect(impolite.pc.connectionState).toBe("connected");
    expect([polite.errors, impolite.errors]).toEqual([[], []]);
  });

  it("makes an offer again whose answer was lost, once unstuck", async () => {
    // Arrange
    let answers = 0;
    const { polite, impolite } = pair((m) => {
      const answer = "description" in m && m.description.type === "answer";
      if (answer) answers += 1;
      return answer && answers === 1;
    });
    impolite.pc.addTransceiver("audio", { direction: "sendonly" });
    await settle();
    const stuck = impolite.pc.signalingState;

    // Act
    await impolite.negotiation.unstick();
    await polite.negotiation.unstick();
    await settle();

    // Assert
    expect(stuck).toBe("have-local-offer");
    expect(impolite.pc.signalingState).toBe("stable");
    expect(impolite.pc.connectionState).toBe("connected");
    expect([polite.errors, impolite.errors]).toEqual([[], []]);
  });

  it("renegotiates a changed direction from either side", async () => {
    const { polite, impolite } = pair();
    impolite.pc.addTransceiver("video", { direction: "sendonly" });
    await settle();

    const [received] = polite.pc.getTransceivers();
    if (!received) throw new Error("no line");
    received.direction = "inactive";
    await settle();

    expect(impolite.pc.getTransceivers()[0]?.currentDirection).toBe("inactive");
    expect([polite.errors, impolite.errors]).toEqual([[], []]);
  });

  it("drops the end-of-candidates marker and reports other failures", async () => {
    const { polite } = pair();

    await polite.negotiation.receiveCandidate(null);
    await polite.negotiation.receiveCandidate({
      candidate: "c",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });
    polite.pc.close();
    await polite.negotiation.receiveDescription({
      type: "offer",
      sdp: '{"lines":[]}',
    });

    expect(polite.errors).toHaveLength(2);
  });

  it("reports an offer it couldn't make", async () => {
    const { impolite } = pair();
    impolite.pc.addTransceiver("audio", { direction: "sendonly" });
    impolite.pc.close();
    impolite.pc.dispatchEvent(new Event("negotiationneeded"));
    await settle();

    expect(impolite.errors).toHaveLength(1);
  });
});
