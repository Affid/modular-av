import { describe, expect, it } from "vitest";
import { fromReceivers, fromSender } from "../src/stats.ts";

describe("LiveKit's own connection", () => {
  it("reads the round trip, jitter and loss the server reports for the microphone", () => {
    const stats = fromSender({
      timestamp: 1,
      roundTripTime: 0.042,
      jitter: 0.003,
      packetsSent: 990,
      packetsLost: 10,
    });

    expect(stats).toEqual({ roundTripMs: 42, jitterMs: 3, packetLoss: 0.01 });
  });

  it("says nothing without a microphone or a report", () => {
    expect(fromSender(undefined)).toEqual({});
    expect(fromSender({ timestamp: 1 })).toEqual({});
  });
});

describe("the media from another player", () => {
  const report = (
    entries: Record<string, Record<string, unknown>>,
  ): ReadonlyMap<string, unknown> => new Map(Object.entries(entries));

  it("takes the worst jitter and the loss since the last reading", () => {
    // Arrange
    const first = [
      report({
        a: {
          type: "inbound-rtp",
          jitter: 0.002,
          packetsReceived: 95,
          packetsLost: 5,
        },
        x: { type: "outbound-rtp", packetsSent: 10 },
      }),
      report({
        v: { type: "inbound-rtp", jitter: 0.02, packetsReceived: 100 },
      }),
    ];
    const later = [
      report({
        a: { type: "inbound-rtp", packetsReceived: 185, packetsLost: 15 },
      }),
      report({ v: { type: "inbound-rtp", packetsReceived: 200 } }),
    ];

    // Act
    const one = fromReceivers(first, { lost: 0, received: 0 });
    const two = fromReceivers(later, one.totals);

    // Assert
    expect(one.stats).toEqual({ jitterMs: 20, packetLoss: 0.025 });
    expect(two.stats).toEqual({ packetLoss: 0.05 });
  });

  it("says nothing without tracks", () => {
    expect(fromReceivers([], { lost: 0, received: 0 }).stats).toEqual({});
  });
});
