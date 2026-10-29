// The 1.0 smoke pass in Firefox (handoff §19): a GM in Chrome and a player
// in Firefox at one table, with the dock: joining, media both ways, seeing,
// muting and the settings window. Skipped when Playwright's Firefox isn't
// installed (`npx playwright install firefox`).
//
// What it can't check here (WSL, 2026-10-29): sound. Playwright's Firefox
// never starts an AudioContext in this environment (headless or not, with
// a gesture, through WSLg's PulseAudio or a null backend), so levels read
// as silence both ways; tracks arriving is all it checks of audio (sound
// is checked in an installed Firefox, firefox-installed.spec.ts). And
// only P2P: this Firefox gathers no loopback ICE candidates, so it can't
// reach the LiveKit in Docker, which announces 127.0.0.1; with
// MAV_LIVEKIT=cloud it tries LiveKit Cloud too.
import {
  type Browser,
  expect,
  firefox,
  type Page,
  test,
} from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

/** Firefox's own fake devices (a tone and a moving picture), no prompts. */
const FIREFOX_PREFS = {
  "media.navigator.streams.fake": true,
  "media.navigator.permission.disabled": true,
  "media.autoplay.default": 0,
  "media.autoplay.blocking_policy": 0,
};

let fx: Browser | null = null;
let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

test.beforeAll(async () => {
  try {
    fx = await firefox.launch({ firefoxUserPrefs: FIREFOX_PREFS });
  } catch {
    fx = null;
  }
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await fx?.close();
  await configureWorld(browser, "livekit", "foundry");
});

/** The width of the picture `viewer`'s dock shows for `id`, 0 for none. */
const pictureWidth = (viewer: Page, id: string): Promise<number> =>
  viewer
    .locator(
      `#camera-views .mav-dock-tile[data-participant-id="${id}"] video.mav-dock-tile-video`,
    )
    .evaluate((v: HTMLVideoElement) => v.videoWidth)
    .catch(() => 0);

/** Who `viewer` has in the call, with audio and video, as "conn:audio:video". */
async function seen(viewer: Player, id: string): Promise<string> {
  const p = (await viewer.state()).participants[id];
  return p
    ? `${String(p.connected)}:${String(p.hasAudio)}:${String(p.hasVideo)}`
    : "missing";
}

const SERVICES =
  process.env.MAV_LIVEKIT === "cloud"
    ? (["p2p", "livekit"] as const)
    : (["p2p"] as const);

for (const service of SERVICES) {
  test(`a player in Firefox joins, sees, mutes and opens the settings over ${service}`, async ({
    browser,
  }) => {
    test.skip(fx === null, "Playwright's Firefox isn't installed");
    if (!fx) return;
    await configureWorld(browser, service, "dock");
    const gm = track(await openGm(browser));
    const p1 = track(await openPlayer(fx, "Player1"));
    for (const player of [gm, p1]) await setVoiceMode(player, "always");
    for (const player of [gm, p1]) await expectStatus(player, "connected");
    const gmId = await idOf(p1, "Gamemaster");
    const p1Id = await idOf(gm, "Player1");

    // Joined, with both kinds of media each way.
    await expect
      .poll(() => seen(p1, gmId), { timeout: 60_000 })
      .toBe("true:true:true");
    await expect
      .poll(() => seen(gm, p1Id), { timeout: 60_000 })
      .toBe("true:true:true");
    expect((await p1.state()).local).toMatchObject({
      hasMicrophone: true,
      hasCamera: true,
      microphoneError: null,
      cameraError: null,
      openMic: false,
    });

    // Seen, each way (sound can't be measured here, see the top).
    await expect.poll(() => pictureWidth(p1.page, gmId)).toBeGreaterThan(0);
    await expect.poll(() => pictureWidth(gm.page, p1Id)).toBeGreaterThan(0);

    // Muting in Firefox silences them for the GM.
    await p1.page.locator(".mav-dock-mute").click();
    await expect
      .poll(async () => (await gm.state()).participants[p1Id]?.muted)
      .toBe(true);
    expect((await p1.state()).local.broadcasting).toBe(false);

    // The settings window opens from the dock, with its tabs.
    await p1.page.locator(".mav-dock-settings").click();
    await expect(p1.page.locator(".mav-settings")).toBeVisible();
    await expect(
      p1.page.locator('.mav-settings [role="tab"]').first(),
    ).toBeVisible();

    expect(p1.notices).toEqual([]);
  });
}
