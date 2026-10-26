import { describe, expect, it } from "vitest";
import { importLegacy, readLegacyClient } from "../src/legacy.ts";

/** Foundry keeps client settings in localStorage as JSON. */
const storage = (values: Record<string, unknown>) => ({
  getItem: (key: string) =>
    key in values ? JSON.stringify(values[key]) : null,
});

function deps(values: Record<string, unknown>, imported = false) {
  const flags: unknown[] = [];
  const calls: unknown[] = [];
  return {
    flags,
    calls,
    deps: {
      storage: storage(values),
      imported: () => imported,
      markImported: (value: boolean) => {
        flags.push(value);
        return Promise.resolve();
      },
      setInputSensitivity: (s: unknown) => {
        calls.push(s);
        return Promise.resolve();
      },
    },
  };
}

describe("a player's choices from LiveKit AVClient, in the core", () => {
  it("reads the old module's client settings as Foundry stored them", () => {
    const s = storage({ "avclient-livekit.audioAutoSensitivity": false });

    expect(readLegacyClient(s, "audioAutoSensitivity")).toBe(false);
    expect(readLegacyClient(s, "nothing")).toBeUndefined();
    expect(
      readLegacyClient({ getItem: () => "not json" }, "audioAutoSensitivity"),
    ).toBeUndefined();
  });

  it("brings the input sensitivity over, once", async () => {
    const d = deps({
      "avclient-livekit.audioAutoSensitivity": false,
      "avclient-livekit.audioNoiseGateThreshold": -42,
    });

    await importLegacy(d.deps);

    expect(d.calls).toEqual([{ auto: false, threshold: -42 }]);
    expect(d.flags).toEqual([true]);
  });

  it("brings only what was saved and makes sense", async () => {
    const d = deps({
      "avclient-livekit.audioAutoSensitivity": "yes",
      "avclient-livekit.audioNoiseGateThreshold": -400,
    });

    await importLegacy(d.deps);

    expect(d.calls).toEqual([]);
  });

  it("does nothing once done", async () => {
    const d = deps({ "avclient-livekit.audioAutoSensitivity": false }, true);

    await importLegacy(d.deps);

    expect(d.calls).toEqual([]);
    expect(d.flags).toEqual([]);
  });
});
