// Milestone 3 end to end: the core's media pipeline in the local Foundry
// world, with livekit-server --dev in Docker (pnpm test:foundry). Chrome's
// fake microphone plays 1.5 s of tone, then 1.5 s of silence.
import { expect, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  notifications,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

const MUTED_HINT =
  "Voice and video: you're muted, so the others can't hear you.";

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

test("a muted player who keeps talking is told so, and nobody else is", async ({
  browser,
}) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  await setVoiceMode(p1, "activity");

  await p1.run((api) => api.commands.setMuted(true), null);

  await expect.poll(() => notifications(p1)).toContain(MUTED_HINT);
  expect((await p1.state()).local.broadcasting).toBe(false);
  expect(await notifications(gm)).not.toContain(MUTED_HINT);
});

test("hiding stops the camera device, and showing starts it again", async ({
  browser,
}) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await expectStatus(p1, "connected");
  const p1Id = await idOf(gm, "Player1");
  const seenByGm = () => gm.state().then((s) => s.participants[p1Id]?.hasVideo);
  await expect.poll(seenByGm).toBe(true);
  // Count the video tracks the page stops.
  await p1.page.evaluate(() => {
    const proto = MediaStreamTrack.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "stop")?.value as (
      this: MediaStreamTrack,
    ) => void;
    const g = globalThis as { stoppedVideo?: number };
    g.stoppedVideo = 0;
    proto.stop = function (this: MediaStreamTrack) {
      if (this.kind === "video") g.stoppedVideo = (g.stoppedVideo ?? 0) + 1;
      original.call(this);
    };
  });

  await p1.run((api) => api.commands.setVideoEnabled(false), null);

  await expect.poll(seenByGm).toBe(false);
  await expect
    .poll(() =>
      p1.page.evaluate(
        () => (globalThis as { stoppedVideo?: number }).stoppedVideo ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  expect((await p1.state()).local.hasCamera).toBe(false);
  expect(p1.notices).toEqual([]);
  await p1.run((api) => api.commands.setVideoEnabled(true), null);
  await expect.poll(seenByGm).toBe(true);
});
