import { describe, expect, it } from "vitest";
import { importLegacy, legacyModel } from "../src/legacy.ts";

/** Foundry keeps client settings in localStorage as JSON. */
const storage = (values: Record<string, unknown>) => ({
  getItem: (key: string) =>
    key in values ? JSON.stringify(values[key]) : null,
});
const old = (values: Record<string, unknown>) =>
  storage(
    Object.fromEntries(
      Object.entries(values).map(([k, v]) => [`avclient-livekit.${k}`, v]),
    ),
  );

describe("the noise model a player had in LiveKit AVClient", () => {
  it.each([
    [{ noiseSuppressionModel: "rnnoise" }, "rnnoise"],
    [
      { enhancedNoiseCancellation: true, noiseSuppressionModel: "speex" },
      "speex",
    ],
    // Turned on, the model never chosen: the old default.
    [{ enhancedNoiseCancellation: true }, "gtcrn"],
    [
      { enhancedNoiseCancellation: false, noiseSuppressionModel: "rnnoise" },
      null,
    ],
    // Krisp's module is held back from releases.
    [{ noiseSuppressionModel: "krisp" }, null],
    [{}, null],
  ])("from %j is %s", (values, expected) => {
    expect(legacyModel(old(values))).toBe(expected);
  });

  it("is turned on once, and marked done", async () => {
    const turned: string[] = [];
    const marks: boolean[] = [];

    await importLegacy({
      storage: old({ noiseSuppressionModel: "rnnoise" }),
      imported: () => false,
      markImported: (v) => {
        marks.push(v);
        return Promise.resolve();
      },
      turnOn: (id) => {
        turned.push(id);
        return Promise.resolve();
      },
    });

    expect(turned).toEqual(["rnnoise"]);
    expect(marks).toEqual([true]);
  });
});
