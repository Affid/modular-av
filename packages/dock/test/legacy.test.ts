import { describe, expect, it } from "vitest";
import { importLegacy, legacyDock } from "../src/legacy.ts";

/** Foundry keeps client settings in localStorage as JSON. */
const old = (values: Record<string, unknown>) => ({
  getItem: (key: string) => {
    const name = key.replace(/^avclient-livekit\./, "");
    return key.startsWith("avclient-livekit.") && name in values
      ? JSON.stringify(values[name])
      : null;
  },
});

describe("the dock a player had in LiveKit AVClient", () => {
  it.each([
    [{ dockLayout: "focus" }, { tileLayout: "focus" }],
    [{ dockLayout: "compact" }, { tileLayout: "grid" }],
    [{ dockFloating: { floating: true } }, { mode: "floating" }],
    [
      { dockFloating: { floating: false }, dockLayout: "grid" },
      { mode: "docked", tileLayout: "grid" },
    ],
    [{ dockLayout: "sideways", dockFloating: "yes" }, {}],
    [{}, {}],
  ])("from %j is %j", (values, expected) => {
    expect(legacyDock(old(values))).toEqual(expected);
  });

  it("is set once, and marked done", async () => {
    const set: string[] = [];
    const marks: boolean[] = [];

    await importLegacy({
      storage: old({ dockLayout: "focus", dockFloating: { floating: true } }),
      imported: () => false,
      markImported: (v) => {
        marks.push(v);
        return Promise.resolve();
      },
      set: (key, value) => {
        set.push(`${key}=${String(value)}`);
        return Promise.resolve();
      },
    });

    expect(set).toEqual(["tileLayout=focus", "mode=floating"]);
    expect(marks).toEqual([true]);
  });
});
