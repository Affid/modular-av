import { FakePeerConnection } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import type { CandidateInit, SessionDescription } from "../src/messages.ts";
import { createNegotiation, type Negotiation } from "../src/negotiation.ts";

type Wire =
  | { readonly description: SessionDescription }
  | { readonly candidate: CandidateInit | null };

interface Side {
  readonly pc: FakePeerConnection;
  readonly negotiation: Negotiation;
  readonly errors: unknown[];
}

/** Two sides whose messages reach each other in order, a turn later. */
function pair(): { readonly polite: Side; readonly impolite: Side } {
  const pcs = [new FakePeerConnection(), new FakePeerConnection()] as const;
  const sides: Side[] = [];
  const deliver = (to: number, message: Wire): void => {
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
    const negotiation = createNegotiation({
      pc,
      polite: index === 0,
      send: (message) => {
        deliver(1 - index, message);
      },
      onError: (error) => errors.push(error),
    });
    sides.push({ pc, negotiation, errors });
  }
  const [polite, impolite] = sides;
  if (!polite || !impolite) throw new Error("no sides");
  return { polite, impolite };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

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
