import { describe, expect, it } from "vitest";
import { LEGACY_SETTING } from "../src/legacy.ts";
import { type PromptDeps, offerLegacyImport } from "../src/legacy-prompt.ts";
import { MODULE_ID } from "../src/settings.ts";

const OLD = JSON.stringify({
  serverType: "custom",
  url: "table.livekit.cloud",
  username: "APIkey",
  password: "secret",
});

function deps(
  over: Partial<PromptDeps> & { choice?: string; remove?: boolean } = {},
) {
  const saved: Record<string, unknown> = {};
  const notices: string[] = [];
  const removed: string[] = [];
  const asked: string[] = [];
  const d: PromptDeps = {
    isGM: true,
    getItem: (key) => (key === LEGACY_SETTING ? OLD : null),
    get: (key) => saved[key] ?? (key === `${MODULE_ID}.serverUrl` ? "" : false),
    set: (key, value) => {
      saved[key] = value;
      return Promise.resolve();
    },
    removeLegacy: () => {
      removed.push(LEGACY_SETTING);
      return Promise.resolve();
    },
    choose: (question) => {
      asked.push(question);
      return Promise.resolve(over.choice ?? "import");
    },
    confirm: (question) => {
      asked.push(question);
      return Promise.resolve(over.remove ?? true);
    },
    notify: (kind, message) => notices.push(`${kind}: ${message}`),
    t: (key) => key.replace(`${MODULE_ID}.legacy.`, ""),
    ...over,
  };
  return { d, saved, notices, removed, asked };
}

describe("offering a GM the old module's server", () => {
  it("imports it, removes the readable secret and says to replace the key", async () => {
    const { d, saved, removed, notices, asked } = deps();

    await offerLegacyImport(d);

    expect(asked).toEqual(["question", "remove"]);
    expect(saved[`${MODULE_ID}.serverUrl`]).toBe("wss://table.livekit.cloud");
    expect(saved[`${MODULE_ID}.apiSecret`]).toBe("secret");
    expect(removed).toEqual([LEGACY_SETTING]);
    expect(notices).toEqual(["info: imported", "warn: rotate"]);
  });

  it("keeps the old setting when the GM says so, and still warns", async () => {
    const { d, removed, notices } = deps({ remove: false });

    await offerLegacyImport(d);

    expect(removed).toEqual([]);
    expect(notices).toEqual(["info: imported", "warn: rotate"]);
  });

  it("asks again next time after 'not now', never after 'don't ask again'", async () => {
    const later = deps({ choice: "later" });
    await offerLegacyImport(later.d);
    expect(later.saved).toEqual({});

    const never = deps({ choice: "never" });
    await offerLegacyImport(never.d);
    expect(never.saved).toEqual({ [`${MODULE_ID}.legacyDeclined`]: true });
  });

  it.each([
    ["a player", { isGM: false }],
    [
      "a world already set up",
      { get: (key: string) => (key.endsWith("serverUrl") ? "wss://x" : false) },
    ],
    [
      "a GM who declined",
      { get: (key: string) => key.endsWith("legacyDeclined") },
    ],
    ["a world without the old module's server", { getItem: () => null }],
  ])("asks nothing of %s", async (_who, over) => {
    const { d, asked } = deps(over);

    await offerLegacyImport(d);

    expect(asked).toEqual([]);
  });

  it("says plainly that Tavern's server isn't supported", async () => {
    const { d, notices, asked } = deps({
      getItem: () => JSON.stringify({ serverType: "tavern" }),
    });

    await offerLegacyImport(d);

    expect(asked).toEqual([]);
    expect(notices).toEqual(["warn: tavern"]);
  });
});
