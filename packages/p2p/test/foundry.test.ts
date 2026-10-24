import { createHooks } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import {
  type FoundryGameSlice,
  foundryServiceDeps,
  randomSessionId,
  redact,
  relayWithoutTurn,
} from "../src/foundry.ts";
import { MODULE_ID } from "../src/settings.ts";
import { createChannelHub } from "./channels.ts";

const TURN = {
  type: "custom",
  url: "turn:t.example",
  username: "u",
  password: "p",
};

function fakeGame(values: Record<string, unknown> = {}): FoundryGameSlice {
  const users = new Map([
    ["gm", { id: "gm", isGM: true }],
    ["p1", { id: "p1", isGM: false }],
  ]);
  return {
    settings: {
      register: () => undefined,
      get: (namespace, key) => values[`${namespace}.${key}`],
    },
    users: { get: (id) => users.get(id) },
    user: { isGM: true },
    webrtc: { settings: { world: { turn: TURN } } },
  };
}

describe("the Foundry side of the P2P service", () => {
  it("reads users, roles and Foundry's TURN server", () => {
    const deps = foundryServiceDeps({
      game: fakeGame(),
      hooks: createHooks(),
      channel: createChannelHub().endpoint("gm").channel,
      onError: () => undefined,
    });

    expect([deps.isUser("p1"), deps.isUser("nobody")]).toEqual([true, false]);
    expect([deps.isGM("gm"), deps.isGM("p1"), deps.isGM("x")]).toEqual([
      true,
      false,
      false,
    ]);
    expect(deps.turn()).toEqual(TURN);
    expect(deps.now()).toBeGreaterThan(0);
  });

  it("calls back on ICE setting changes and users leaving, until removed", () => {
    // Arrange
    const hooks = createHooks();
    const deps = foundryServiceDeps({
      game: fakeGame(),
      hooks,
      channel: createChannelHub().endpoint("gm").channel,
      onError: () => undefined,
    });
    const ice = vi.fn();
    const left = vi.fn();
    const offIce = deps.onIceChange(ice);
    const offLeft = deps.onUserLeft(left);

    // Act
    hooks.callAll("updateSetting", { key: "core.rtcWorldSettings" });
    hooks.callAll("updateSetting", { key: `${MODULE_ID}.stunServers` });
    hooks.callAll("updateSetting", { key: "core.permissions" });
    hooks.callAll("userConnected", { id: "p1" }, false);
    hooks.callAll("userConnected", { id: "p1" }, true);
    offIce();
    offLeft();
    hooks.callAll("updateSetting", { key: "core.rtcWorldSettings" });
    hooks.callAll("userConnected", { id: "p1" }, false);

    // Assert
    expect(ice).toHaveBeenCalledTimes(2);
    expect(left.mock.calls).toEqual([["p1"]]);
  });

  it("makes session ids that pass the signalling check", () => {
    const id = randomSessionId();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSessionId()).not.toBe(id);
  });

  it("warns a GM who asked for relaying without a TURN server", () => {
    const relay = { [`${MODULE_ID}.relayOnly`]: true };
    const withoutTurn = {
      ...fakeGame(relay),
      webrtc: { settings: { world: { turn: { ...TURN, type: "server" } } } },
    };

    expect(relayWithoutTurn(withoutTurn)).toBe(true);
    expect(relayWithoutTurn(fakeGame(relay))).toBe(false);
    expect(relayWithoutTurn({ ...withoutTurn, user: { isGM: false } })).toBe(
      false,
    );
    expect(relayWithoutTurn({ ...fakeGame(), webrtc: null })).toBe(false);
  });

  it("keeps addresses out of logged errors", () => {
    expect(
      redact("Failed: candidate 192.0.2.10 5000 and [2001:db8::1]:3478\nsdp"),
    ).toBe("Failed: candidate [address] 5000 and [[address]]:3478");
  });
});
