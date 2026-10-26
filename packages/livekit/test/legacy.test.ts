import { describe, expect, it } from "vitest";
import {
  importLegacyServer,
  LEGACY_SETTING,
  type LegacyDeps,
  readLegacyServer,
  serverUrlOf,
} from "../src/legacy.ts";
import { MODULE_ID } from "../src/settings.ts";

const stored = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

describe("LiveKit AVClient's server settings", () => {
  it("are read from the world's stored settings, as the old module saved them", () => {
    const read = readLegacyServer((key) =>
      key === LEGACY_SETTING
        ? stored({
            serverType: "custom",
            url: "table.livekit.cloud",
            username: "APIkey",
            password: "secret",
          })
        : null,
    );

    expect(read).toEqual({
      kind: "custom",
      url: "table.livekit.cloud",
      key: "APIkey",
      secret: "secret",
    });
  });

  it("are read as Foundry v14 hands them over too: already parsed", () => {
    const read = readLegacyServer(() => ({
      serverType: "custom",
      url: "table.livekit.cloud",
      username: "APIkey",
      password: "secret",
    }));

    expect(read?.kind).toBe("custom");
  });

  it("are a server type of its own for Tavern's Patreon server", () => {
    expect(readLegacyServer(() => stored({ serverType: "tavern" }))).toEqual({
      kind: "tavern",
    });
  });

  it.each([
    null,
    "not json",
    stored({}),
    stored({ serverType: "custom" }),
    stored(3),
  ])("are nothing to import from %j", (value) => {
    expect(readLegacyServer(() => value)).toBeNull();
  });
});

describe("the old server address", () => {
  it.each([
    ["table.livekit.cloud", "wss://table.livekit.cloud"],
    ["  my.server:7880/rtc ", "wss://my.server:7880/rtc"],
    ["wss://table.livekit.cloud", "wss://table.livekit.cloud"],
    ["ws://localhost:7880", "ws://localhost:7880"],
  ])("%s becomes %s", (url, expected) => {
    expect(serverUrlOf(url)).toBe(expected);
  });

  it.each(["", "https://evil.example", "javascript:alert(1)", "user:pw@host"])(
    "%j isn't a server address",
    (url) => {
      expect(serverUrlOf(url)).toBeNull();
    },
  );
});

function deps(over: Partial<LegacyDeps> = {}): LegacyDeps & {
  readonly saved: Record<string, unknown>;
  readonly removed: string[];
} {
  const saved: Record<string, unknown> = {};
  const removed: string[] = [];
  return {
    saved,
    removed,
    set: (key, value) => {
      saved[key] = value;
      return Promise.resolve();
    },
    removeLegacy: () => {
      removed.push(LEGACY_SETTING);
      return Promise.resolve();
    },
    ...over,
  };
}

describe("importing the old server settings", () => {
  const legacy = {
    kind: "custom",
    url: "table.livekit.cloud",
    key: "APIkey",
    secret: "secret",
  } as const;

  it("puts the address in the world and the key and secret on this device only", async () => {
    const d = deps();

    const result = await importLegacyServer(legacy, { removeOld: false }, d);

    expect(result).toEqual({ imported: true, removed: false });
    expect(d.saved).toEqual({
      [`${MODULE_ID}.serverUrl`]: "wss://table.livekit.cloud",
      [`${MODULE_ID}.apiKey`]: "APIkey",
      [`${MODULE_ID}.apiSecret`]: "secret",
    });
    expect(d.removed).toEqual([]);
  });

  it("removes the old setting, which every player can read, when asked", async () => {
    const d = deps();

    const result = await importLegacyServer(legacy, { removeOld: true }, d);

    expect(result).toEqual({ imported: true, removed: true });
    expect(d.removed).toEqual([LEGACY_SETTING]);
  });

  it("imports nothing from an address that isn't a server's", async () => {
    const d = deps();

    const result = await importLegacyServer(
      { ...legacy, url: "https://not.a.websocket" },
      { removeOld: true },
      d,
    );

    expect(result).toEqual({ imported: false, removed: false });
    expect(d.saved).toEqual({});
    expect(d.removed).toEqual([]);
  });
});
