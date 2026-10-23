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

test("voice activity: Foundry's detector drives it, and stays idle without a levels stream", async ({
  browser,
}) => {
  track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  // Foundry's audio (and so its level reports) unlocks on a first gesture;
  // the fake microphone beeps at about -42 dB, barely over the default -45.
  await p1.page.mouse.click(400, 400);
  await p1.run((_api, game) => {
    game.webrtc.settings.set("client", "voice.activityThreshold", -60);
    const client = game.webrtc.client as {
      toggleBroadcast(b: boolean): void;
      calls?: boolean[];
    };
    const original = client.toggleBroadcast.bind(client);
    client.calls = [];
    client.toggleBroadcast = (b: boolean) => {
      client.calls = [...(client.calls ?? []), b];
      original(b);
    };
  }, null);
  const calls = () =>
    p1.run(
      (_api, game) => (game.webrtc.client as { calls?: boolean[] }).calls ?? [],
      null,
    );

  // With the core's raw-microphone levels stream, AVMaster's detector hears
  // the beeps and broadcasts, and the core sends the microphone.
  await setVoiceMode(p1, "activity");
  await expect.poll(calls).toContain(true);
  await expect
    .poll(async () => (await p1.state()).local.broadcasting)
    .toBe(true);

  // Without a levels stream (the core's own gate, from milestone 3), its
  // detector stays idle: it never calls toggleBroadcast by itself.
  await p1.run((_api, game) => {
    const client = game.webrtc.client as {
      getLevelsStreamForUser(): null;
      calls?: boolean[];
    };
    client.getLevelsStreamForUser = () => null;
    client.calls = [];
    game.webrtc._initializeUserVoiceDetection("activity");
  }, null);
  await p1.page.waitForTimeout(8_000);
  expect(await calls()).toEqual([]);
});
