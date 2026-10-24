// Milestone 2 end to end: the core and modular-av-livekit in the local
// Foundry world, with livekit-server --dev in Docker (pnpm test:foundry).
import { expect, test } from "@playwright/test";
import { livekitOutage, usesCloud } from "../../scripts/services/livekit.ts";
import {
  configureWorld,
  expectStatus,
  idOf,
  notifications,
  openGm,
  openPlayer,
  openSecondTab,
  type Player,
  setVoiceMode,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser);
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test("players join with a GM-relayed token and see each other in Foundry's dock", async ({
  browser,
}) => {
  // Arrange / Act
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  const p2 = track(await openPlayer(browser, "Player2"));

  // Assert
  for (const player of [gm, p1, p2]) await expectStatus(player, "connected");
  const gmId = await idOf(p1, "Gamemaster");
  const p2Id = await idOf(p1, "Player2");
  await expect
    .poll(async () => {
      const { participants } = await p1.state();
      return [gmId, p2Id].map((id) => {
        const p = participants[id];
        return p
          ? `${p.name}:${String(p.connected)}:${String(p.hasAudio)}:${String(p.hasVideo)}`
          : "missing";
      });
    })
    .toEqual(["Gamemaster:true:true:true", "Player2:true:true:true"]);
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
  expect([...gm.notices, ...p1.notices, ...p2.notices]).toEqual([]);
});

test("mute holds and shows to the others", async ({ browser }) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await setVoiceMode(p1, "always");
  await expectStatus(p1, "connected");
  const p1Id = await idOf(gm, "Player1");
  await expect
    .poll(async () => (await p1.state()).local.broadcasting)
    .toBe(true);

  await p1.run((api) => api.commands.setMuted(true), null);

  expect((await p1.state()).local.broadcasting).toBe(false);
  await expect
    .poll(async () => (await gm.state()).participants[p1Id]?.muted)
    .toBe(true);
  await p1.run((api) => api.commands.setMuted(false), null);
  await expect
    .poll(async () => (await p1.state()).local.broadcasting)
    .toBe(true);
});

test("a second tab of the same player wins; the first stops for good", async ({
  browser,
}) => {
  track(await openGm(browser));
  const first = track(await openPlayer(browser, "Player1"));
  await expectStatus(first, "connected");

  const second = track(await openSecondTab(first));

  await expectStatus(second, "connected");
  await expect
    .poll(async () => (await first.state()).session)
    .toMatchObject({ status: "left", reason: "joined-elsewhere" });
  await expect
    .poll(() => notifications(first))
    .toContain("Voice and video continued in another tab or window.");
});

test("a GM's block takes the player's audio off at once and in new tokens", async ({
  browser,
}) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  const p1Id = await idOf(gm, "Player1");
  await expect
    .poll(async () => (await gm.state()).participants[p1Id]?.hasAudio)
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
    await expect
      .poll(async () => (await gm.state()).participants[p1Id]?.hasAudio)
      .toBe(false);
    await expectStatus(p1, "connected");
    await expect
      .poll(async () => (await gm.state()).participants[p1Id]?.hasVideo)
      .toBe(true);
  } finally {
    await gm.run(
      (api, _game, id) =>
        api.commands.setBroadcastPermissions(id, { audio: true }),
      p1Id,
    );
  }
});

test("players wait plainly for a GM, and join when one logs in", async ({
  browser,
}) => {
  const p2 = track(await openPlayer(browser, "Player2"));

  await expectStatus(p2, "waiting-for-gm");
  await expect
    .poll(() => notifications(p2))
    .toContain("Voice and video: waiting for a GM to let you join.");
  track(await openGm(browser, "Gamemaster2"));

  await expectStatus(p2, "connected");
});

test("reconnects after the server was gone for 20 s, telling the player once", async ({
  browser,
}) => {
  test.skip(usesCloud(), "LiveKit Cloud can't be paused from here");
  test.setTimeout(180_000);
  track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  const seen: string[] = [];
  await p1.page.exposeFunction("reportStatus", (status: string) =>
    seen.push(status),
  );
  await p1.run((api) => {
    const g = globalThis as unknown as { reportStatus(s: string): void };
    api.state.subscribe(
      (s) => s.session.status,
      (status) => {
        g.reportStatus(status);
      },
    );
  }, null);

  await livekitOutage.start();
  try {
    await expect.poll(() => seen, { timeout: 30_000 }).toContain("resuming");
    await p1.page.waitForTimeout(20_000);
  } finally {
    await livekitOutage.end();
  }

  await expectStatus(p1, "connected", 90_000);
  const told = await notifications(p1);
  const reconnecting = told.filter(
    (n) => n === "Voice and video: connection lost, reconnecting…",
  );
  expect(reconnecting.length).toBeLessThanOrEqual(1);
  expect(told).toContain(
    seen.includes("retrying") ? "Voice and video reconnected." : told[0],
  );
});

test("voice activity: the core's gate drives it, and Foundry's detector stays idle", async ({
  browser,
}) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  const p1Id = await idOf(gm, "Player1");

  await setVoiceMode(p1, "activity");

  // The fake microphone beeps about once a second: the gate opens on the
  // beeps and tells Foundry, whose activity reaches the others. (LiveKit's
  // own speaker detection, which the core shows when the service has it,
  // doesn't fire on the beep, at about -42 dB.)
  const fast = { intervals: [50], timeout: 15_000 };
  await expect
    .poll(async () => (await p1.state()).local.broadcasting, fast)
    .toBe(true);
  await expect
    .poll(
      () =>
        gm.run(
          (_api, game, id) =>
            (
              game.webrtc.settings as unknown as {
                activity: Record<string, { speaking?: boolean }>;
              }
            ).activity[id]?.speaking,
          p1Id,
        ),
      fast,
    )
    .toBe(true);
  const local = await p1.run(
    (api, game) => ({
      levels: (
        game.webrtc.client as {
          getLevelsStreamForUser(id: string): MediaStream | null;
        }
      ).getLevelsStreamForUser(game.userId),
      openMic: api.state.get().local.openMic,
    }),
    null,
  );
  expect(local).toEqual({ levels: null, openMic: false });
});
