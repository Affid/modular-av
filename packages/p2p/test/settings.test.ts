import { describe, expect, it } from "vitest";
import { iceConfiguration } from "../src/ice.ts";
import {
  DEFAULT_STUN,
  MODULE_ID,
  readSettings,
  registerSettings,
  type SettingsApi,
} from "../src/settings.ts";

function fakeSettings(values: Record<string, unknown> = {}) {
  const registered: Record<string, Readonly<Record<string, unknown>>> = {};
  const api: SettingsApi = {
    register: (namespace, key, config) => {
      registered[`${namespace}.${key}`] = config;
    },
    get: (namespace, key) => values[`${namespace}.${key}`],
  };
  return { api, registered };
}

const read = (values: Record<string, unknown>) =>
  readSettings(
    fakeSettings(
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [`${MODULE_ID}.${k}`, v]),
      ),
    ).api,
  );

describe("P2P settings", () => {
  it("keeps every setting in the world, for the GM to choose", () => {
    const { api, registered } = fakeSettings();

    registerSettings(api);

    expect(Object.keys(registered).sort()).toEqual([
      `${MODULE_ID}.maxParticipants`,
      `${MODULE_ID}.relayOnly`,
      `${MODULE_ID}.stunServers`,
    ]);
    for (const config of Object.values(registered))
      expect(config).toMatchObject({ scope: "world", config: true });
    expect(registered[`${MODULE_ID}.maxParticipants`]).toMatchObject({
      default: 6,
      range: { min: 2, max: 10, step: 1 },
    });
    expect(registered[`${MODULE_ID}.stunServers`]).toMatchObject({
      default: DEFAULT_STUN,
    });
  });

  it("reads the cap as a whole number within its range", () => {
    expect(read({ maxParticipants: 4 }).maxParticipants()).toBe(4);
    expect(read({ maxParticipants: 40 }).maxParticipants()).toBe(10);
    expect(read({ maxParticipants: 1 }).maxParticipants()).toBe(2);
    expect(read({ maxParticipants: 3.7 }).maxParticipants()).toBe(3);
    expect(read({ maxParticipants: "x" }).maxParticipants()).toBe(6);
  });

  it("reads STUN servers from a list, keeping only STUN URLs", () => {
    const servers = read({
      stunServers:
        " stun:a.example:3478, stuns:b.example\nturn:c.example javascript:x",
    }).stunServers();

    expect(servers).toEqual(["stun:a.example:3478", "stuns:b.example"]);
    expect(read({ stunServers: "" }).stunServers()).toEqual([]);
    expect(read({}).stunServers()).toEqual([]);
  });

  it("reads relay only as a yes or no", () => {
    expect(read({ relayOnly: true }).relayOnly()).toBe(true);
    expect(read({ relayOnly: "yes" }).relayOnly()).toBe(false);
  });
});

describe("iceConfiguration", () => {
  const turn = {
    type: "custom",
    url: "turn:turn.example:3478?transport=udp",
    username: "u",
    password: "p",
  };
  const settings = (relayOnly: boolean) => ({
    maxParticipants: () => 6,
    stunServers: () => ["stun:stun.example:3478"],
    relayOnly: () => relayOnly,
  });

  it("uses Foundry's TURN server when one is set, relaying only if asked", () => {
    expect(iceConfiguration(turn, settings(false))).toEqual({
      iceServers: [
        {
          urls: ["turn:turn.example:3478?transport=udp"],
          username: "u",
          credential: "p",
        },
      ],
      iceTransportPolicy: "all",
    });
    expect(iceConfiguration(turn, settings(true)).iceTransportPolicy).toBe(
      "relay",
    );
  });

  it("falls back to the STUN servers without a usable TURN server", () => {
    const stunOnly = {
      iceServers: [{ urls: ["stun:stun.example:3478"] }],
      iceTransportPolicy: "all",
    };

    expect(iceConfiguration(null, settings(true))).toEqual(stunOnly);
    expect(
      iceConfiguration({ ...turn, type: "server" }, settings(false)),
    ).toEqual(stunOnly);
    expect(
      iceConfiguration({ ...turn, password: "" }, settings(false)),
    ).toEqual(stunOnly);
    expect(
      iceConfiguration(
        { ...turn, url: "http://turn.example" },
        settings(false),
      ),
    ).toEqual(stunOnly);
  });

  it("takes several TURN URLs and no STUN servers when there are none", () => {
    const config = iceConfiguration(
      { ...turn, url: "turn:a.example, turns:b.example:5349?transport=tcp" },
      settings(false),
    );
    const none = iceConfiguration(null, {
      ...settings(false),
      stunServers: () => [],
    });

    expect(config.iceServers?.[0]?.urls).toEqual([
      "turn:a.example",
      "turns:b.example:5349?transport=tcp",
    ]);
    expect(none.iceServers).toEqual([]);
  });
});
