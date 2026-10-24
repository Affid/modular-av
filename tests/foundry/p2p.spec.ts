// Milestone 4 end to end: the core and modular-av-p2p in the local Foundry
// world, signalling over Foundry's socket; coturn in Docker for relaying
// (pnpm test:foundry).
import { expect, test } from "@playwright/test";
import { COTURN, coturnOutage } from "../../scripts/services/coturn.ts";
import {
  configureWorld,
  expectStatus,
  idOf,
  NO_TURN,
  notifications,
  openPlayer,
  openSecondTab,
  type Player,
  setVoiceMode,
  type TurnSetting,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

interface P2PWorld {
  readonly maxParticipants: number;
  readonly relayOnly: boolean;
  readonly turn: TurnSetting;
}

const DEFAULTS: P2PWorld = {
  maxParticipants: 6,
  relayOnly: false,
  turn: NO_TURN,
};

/** The GM's P2P choices and Foundry's relay server, for pages that load later. */
async function setP2P(gm: Player, world: Partial<P2PWorld>): Promise<void> {
  await gm.run(
    async (_api, game, config) => {
      const current = game.settings.get("core", "rtcWorldSettings") as object;
      await game.settings.set("core", "rtcWorldSettings", {
        ...current,
        turn: config.turn,
      });
      await game.settings.set(
        "modular-av-p2p",
        "maxParticipants",
        config.maxParticipants,
      );
      await game.settings.set("modular-av-p2p", "relayOnly", config.relayOnly);
    },
    { ...DEFAULTS, ...world },
  );
}

/** "Name:connected:hasAudio:hasVideo" for each named player, as `viewer` sees them. */
async function seen(
  viewer: Player,
  names: readonly string[],
): Promise<string[]> {
  const { participants } = await viewer.state();
  const ids = await Promise.all(names.map((n) => idOf(viewer, n)));
  return ids.map((id) => {
    const p = participants[id];
    return p
      ? `${p.name}:${String(p.connected)}:${String(p.hasAudio)}:${String(p.hasVideo)}`
      : "missing";
  });
}

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "p2p");
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  const gm = await openPlayer(browser, "Gamemaster");
  await setP2P(gm, DEFAULTS);
  await gm.close();
});

test("players join with no GM online and see and hear each other in Foundry's dock", async ({
  browser,
}) => {
  // Arrange / Act
  const players = [
    track(await openPlayer(browser, "Player1")),
    track(await openPlayer(browser, "Player2")),
    track(await openPlayer(browser, "Player3")),
  ];

  // Assert
  for (const player of players) await expectStatus(player, "connected");
  const [p1] = players;
  if (!p1) throw new Error("no players");
  await expect
    .poll(() => seen(p1, ["Player2", "Player3"]), { timeout: 60_000 })
    .toEqual(["Player2:true:true:true", "Player3:true:true:true"]);
  const dock = await p1.page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLVideoElement>(
        "#camera-views video.user-camera",
      ),
    ].map((v) => {
      const stream = v.srcObject as MediaStream | null;
      return {
        video: stream?.getVideoTracks().length ?? 0,
        audio: stream?.getAudioTracks().length ?? 0,
      };
    }),
  );
  expect(dock.filter((d) => d.video === 1)).toHaveLength(3);
  expect(dock.every((d) => d.audio === 0)).toBe(true);
  expect(players.flatMap((p) => p.notices)).toEqual([]);
});

test("mute holds and shows to the others", async ({ browser }) => {
  const p1 = track(await openPlayer(browser, "Player1"));
  const p2 = track(await openPlayer(browser, "Player2"));
  await setVoiceMode(p1, "always");
  await expectStatus(p1, "connected");
  const p1Id = await idOf(p2, "Player1");
  await expect
    .poll(async () => (await p2.state()).participants[p1Id]?.hasAudio)
    .toBe(true);

  await p1.run((api) => api.commands.setMuted(true), null);

  expect((await p1.state()).local.broadcasting).toBe(false);
  await expect
    .poll(async () => (await p2.state()).participants[p1Id]?.muted)
    .toBe(true);
  await p1.run((api) => api.commands.setMuted(false), null);
  await expect
    .poll(async () => (await p1.state()).local.broadcasting)
    .toBe(true);
});

test("a GM's block: every other player refuses the blocked player's audio", async ({
  browser,
}) => {
  const gm = track(await openPlayer(browser, "Gamemaster"));
  const p1 = track(await openPlayer(browser, "Player1"));
  const p2 = track(await openPlayer(browser, "Player2"));
  await expectStatus(p2, "connected");
  const p1Id = await idOf(gm, "Player1");
  await expect
    .poll(async () => (await p2.state()).participants[p1Id]?.hasAudio)
    .toBe(true);

  try {
    await gm.run(
      (api, _game, id) =>
        api.commands.setBroadcastPermissions(id, { audio: false }),
      p1Id,
    );

    await expect
      .poll(async () => (await p1.state()).local.canPublish.audio)
      .toBe(false);
    for (const viewer of [gm, p2])
      await expect
        .poll(async () => (await viewer.state()).participants[p1Id]?.hasAudio)
        .toBe(false);
    await expect
      .poll(async () => (await p2.state()).participants[p1Id]?.hasVideo)
      .toBe(true);
  } finally {
    await gm.run(
      (api, _game, id) =>
        api.commands.setBroadcastPermissions(id, { audio: true }),
      p1Id,
    );
  }
});

test("a second tab of the same player wins; the first stops for good", async ({
  browser,
}) => {
  const p2 = track(await openPlayer(browser, "Player2"));
  const first = track(await openPlayer(browser, "Player1"));
  await expectStatus(first, "connected");

  const second = track(await openSecondTab(first));

  await expectStatus(second, "connected");
  await expect
    .poll(async () => (await first.state()).session)
    .toMatchObject({ status: "left", reason: "joined-elsewhere" });
  await expect
    .poll(() => seen(p2, ["Player1"]), { timeout: 60_000 })
    .toEqual(["Player1:true:true:true"]);
});

test("a player who reloads leaves the others' call and comes back", async ({
  browser,
}) => {
  const p1 = track(await openPlayer(browser, "Player1"));
  const p2 = track(await openPlayer(browser, "Player2"));
  await expect
    .poll(() => seen(p1, ["Player2"]), { timeout: 90_000 })
    .toEqual(["Player2:true:true:true"]);

  const reloading = p2.page.reload();
  await expect
    .poll(async () => (await seen(p1, ["Player2"]))[0]?.split(":")[1])
    .not.toBe("true");
  await reloading;

  await expect
    .poll(() => seen(p1, ["Player2"]), { timeout: 90_000 })
    .toEqual(["Player2:true:true:true"]);
});

test("past the cap a player is told the call is full; a GM always gets in", async ({
  browser,
}) => {
  // Four page loads, each a minute or more without a GPU.
  test.setTimeout(600_000);
  // Arrange
  const gmSetup = await openPlayer(browser, "Gamemaster");
  await setP2P(gmSetup, { maxParticipants: 2 });
  await gmSetup.close();
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  const p2 = track(await openPlayer(browser, "Player2"));
  await expectStatus(p2, "connected");

  // Act
  const p3 = await openPlayer(browser, "Player3");
  try {
    // A page that just loaded reads the others' replies up to a minute late.
    await expect
      .poll(async () => (await p3.state()).session, { timeout: 120_000 })
      .toMatchObject({ status: "left", reason: "full" });
    await expect
      .poll(() => notifications(p3))
      .toContain(
        "The voice and video call is full. Rejoin when someone leaves.",
      );
  } finally {
    // Four Foundry pages at once are more than this machine loads in time.
    await p3.close();
  }
  const gm = track(await openPlayer(browser, "Gamemaster"));

  // Assert
  await expectStatus(gm, "connected");
  await expect
    .poll(async () => (await p2.state()).session, { timeout: 120_000 })
    .toMatchObject({ status: "left", reason: "full" });
  await expectStatus(p1, "connected");
  await setP2P(gm, DEFAULTS);
});

test("relayed through Foundry's TURN server, a 20 s relay outage resumes and recovers", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const gmSetup = await openPlayer(browser, "Gamemaster");
  await setP2P(gmSetup, {
    relayOnly: true,
    turn: {
      type: "custom",
      url: COTURN.url,
      username: COTURN.username,
      password: COTURN.password,
    },
  });
  await gmSetup.close();
  const p1 = track(await openPlayer(browser, "Player1"));
  track(await openPlayer(browser, "Player2"));
  await expect
    .poll(() => seen(p1, ["Player2"]), { timeout: 90_000 })
    .toEqual(["Player2:true:true:true"]);

  await coturnOutage.start();
  try {
    // Every link went through the relay, so all of them break.
    await expectStatus(p1, "resuming", 30_000);
    await p1.page.waitForTimeout(20_000);
  } finally {
    await coturnOutage.end();
  }

  await expectStatus(p1, "connected", 90_000);
  await expect
    .poll(() => seen(p1, ["Player2"]), { timeout: 90_000 })
    .toEqual(["Player2:true:true:true"]);
  const gm = track(await openPlayer(browser, "Gamemaster"));
  await setP2P(gm, DEFAULTS);
});
