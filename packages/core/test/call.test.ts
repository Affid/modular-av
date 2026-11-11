import { createFakeWorld } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { TOKEN_TTL_SECONDS, tokenRequestFor } from "../src/call/call.ts";
import { createAVFacts } from "../src/foundry/av-facts.ts";
import { registerScreenShareSetting } from "../src/media/screen-rule.ts";

const USERS = [
  { id: "gm", name: "Gamemaster", role: 4 },
  { id: "p1", name: "Player1", role: 2 },
  { id: "p4", name: "Player4", role: 1 },
] as const;

function gmClient(mode = 3) {
  const client = createFakeWorld({ users: USERS, av: { mode } }).connect("gm");
  registerScreenShareSetting(client.game, () => undefined);
  client.runLifecycle();
  return client;
}

describe("what a GM signs", () => {
  it("names the user, the world's room and their rights", () => {
    const { game } = gmClient();

    expect(tokenRequestFor(game, createAVFacts(game), "p4")).toEqual({
      participant: "p4",
      room: "test-world",
      canPublish: { audio: false, video: false, screen: false },
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
  });

  it("signs for a user Foundry still lists as inactive", () => {
    // A second tab loading: Foundry's flag lags, the socket is live.
    const { game } = gmClient();

    expect(game.users.get("p1")?.active).toBe(false);
    expect(tokenRequestFor(game, createAVFacts(game), "p1")).not.toBeNull();
  });

  it("lets a token publish a screen where the world's rule allows it", async () => {
    const { game } = gmClient();

    const before = tokenRequestFor(game, createAVFacts(game), "p1");
    await game.settings.set("modular-av", "screenShare", "gm");
    const after = tokenRequestFor(game, createAVFacts(game), "p1");
    const gm = tokenRequestFor(game, createAVFacts(game), "gm");

    expect(before?.canPublish.screen).toBe(true);
    expect(after?.canPublish.screen).toBe(false);
    expect(gm?.canPublish.screen).toBe(true);
  });

  it("signs nothing for unknown users or with A/V disabled", () => {
    const enabled = gmClient().game;
    const disabled = gmClient(0).game;

    expect(tokenRequestFor(enabled, createAVFacts(enabled), "x")).toBeNull();
    expect(tokenRequestFor(disabled, createAVFacts(disabled), "p1")).toBeNull();
  });
});
