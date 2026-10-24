import { describe, expect, it } from "vitest";
import { rate, readStats, videoLimits } from "../src/stats.ts";

const report = (
  entries: Record<string, Record<string, unknown> | null>,
): ReadonlyMap<string, unknown> => new Map(Object.entries(entries));

describe("readStats", () => {
  it("reads the round trip of the pair in use and the loss since last time", () => {
    // Arrange
    const first = report({
      pair: {
        type: "candidate-pair",
        state: "succeeded",
        nominated: true,
        currentRoundTripTime: 0.12,
      },
      spare: { type: "candidate-pair", state: "failed", nominated: false },
      a: { type: "inbound-rtp", packetsLost: 2, packetsReceived: 98 },
      v: { type: "inbound-rtp", packetsLost: 0, packetsReceived: 100 },
    });
    const later = report({
      a: { type: "inbound-rtp", packetsLost: 12, packetsReceived: 188 },
      v: { type: "inbound-rtp", packetsLost: 0, packetsReceived: 200 },
    });

    // Act
    const one = readStats(first, { lost: 0, received: 0 });
    const two = readStats(later, one.totals);

    // Assert
    expect(one.stats).toEqual({ roundTripMs: 120, packetLoss: 0.01 });
    expect(two.stats).toEqual({ packetLoss: 0.05 });
  });

  it("says nothing it doesn't know", () => {
    const { stats } = readStats(
      report({ odd: null, other: { type: "outbound-rtp" } }),
      { lost: 0, received: 0 },
    );

    expect(stats).toEqual({});
  });
});

describe("rate", () => {
  it("rates a link by its round trip and loss", () => {
    expect(rate({ roundTripMs: 40, packetLoss: 0 })).toBe("excellent");
    expect(rate({})).toBe("excellent");
    expect(rate({ roundTripMs: 250 })).toBe("good");
    expect(rate({ packetLoss: 0.03 })).toBe("good");
    expect(rate({ roundTripMs: 600 })).toBe("poor");
    expect(rate({ packetLoss: 0.2 })).toBe("poor");
  });
});

describe("videoLimits", () => {
  it("shares the upload between the links, within bounds", () => {
    expect(videoLimits(1)).toEqual({
      maxBitrate: 800_000,
      scaleResolutionDownBy: 1,
    });
    expect(videoLimits(4)).toEqual({
      maxBitrate: 600_000,
      scaleResolutionDownBy: 1,
    });
    expect(videoLimits(5)).toEqual({
      maxBitrate: 480_000,
      scaleResolutionDownBy: 2,
    });
    expect(videoLimits(20).maxBitrate).toBe(150_000);
  });
});
