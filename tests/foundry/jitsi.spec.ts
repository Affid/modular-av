// Milestone 8 end to end: the core and modular-av-jitsi in the local
// Foundry world, with docker-jitsi-meet (token authentication) in Docker
// (pnpm test:foundry).
import { expect, test } from "@playwright/test";
import { jitsiOutage } from "../../scripts/services/jitsi.ts";
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
  await configureWorld(browser, "jitsi");
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit");
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
  await expect
    .poll(() => seen(p1, ["Gamemaster", "Player2"]))
    .toEqual(["Gamemaster:true:true:true", "Player2:true:true:true"]);
  const dock = await p1.page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLVideoElement>(
        "#camera-views video.user-camera",
      ),
    ].map((v) => (v.srcObject as MediaStream | null)?.getVideoTracks().length),
  );
  expect(dock.filter((videos) => videos === 1)).toHaveLength(3);
  expect([...gm.notices, ...p1.notices, ...p2.notices]).toEqual([]);
});

test("mute holds and shows to the others", async ({ browser }) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await setVoiceMode(p1, "always");
  await expectStatus(p1, "connected");
  const p1Id = await idOf(gm, "Player1");

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

test("a GM's block: the others refuse the player's audio, video goes on", async ({
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
});

test("players wait plainly for a GM, and join when one logs in", async ({
  browser,
}) => {
  const p2 = track(await openPlayer(browser, "Player2"));

  await expectStatus(p2, "waiting-for-gm");
  track(await openGm(browser, "Gamemaster2"));

  await expectStatus(p2, "connected");
});

test("reconnects after the server was gone for 20 s, telling the player once", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  const statuses: string[] = [];
  await p1.page.exposeFunction("reportStatus", (status: string) =>
    statuses.push(status),
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

  await jitsiOutage.start();
  try {
    await expect
      .poll(() => statuses, { timeout: 30_000 })
      .toContain("resuming");
    await p1.page.waitForTimeout(20_000);
  } finally {
    await jitsiOutage.end();
  }

  await expectStatus(p1, "connected", 90_000);
  const told = await notifications(p1);
  expect(
    told.filter((n) => n === "Voice and video: connection lost, reconnecting…")
      .length,
  ).toBeLessThanOrEqual(1);
});
