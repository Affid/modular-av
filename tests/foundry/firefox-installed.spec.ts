// A player in an installed Firefox, driven over WebDriver BiDi, with its
// autoplay rules as shipped: the GM hears them before their first click
// on the game page (the core starts its capture graph on load, without a
// gesture there), and they hear the GM. Playwright's own Firefox can't
// show this: it never starts Web Audio here (see firefox.spec.ts).
//
// Opt-in: MAV_FIREFOX_EXE names the Firefox, or from WSL the Windows one
// through scripts/foundry/wsl-firefox.sh. From WSL, run it with
// MAV_LIVEKIT=cloud: a Windows Firefox can't meet WSL's Chrome directly
// and ignores a TURN server on 127.0.0.1, the only address WSL's Docker
// offers it. Checked 2026-10-29 with Firefox 158.0.1 on Windows.
import { type Browser, expect, firefox, test } from "@playwright/test";
import { usesCloud } from "../../scripts/services/livekit.ts";
import {
  configureWorld,
  expectStatus,
  idOf,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
} from "./world.ts";

const EXE = process.env.MAV_FIREFOX_EXE;

/** Firefox's own tone and picture, no prompts; autoplay left as shipped. */
const PREFS = {
  "media.navigator.streams.fake": true,
  "media.navigator.permission.disabled": true,
};

/** Quieter than this is silence: the fake tone measures around -23 dBFS. */
const HEARD_DB = -60;

/** The loudest `listener` hears `speaker` over 4 s, in dBFS, on their tile. */
const loudness = (listener: Player, speaker: string): Promise<number> =>
  listener.run(
    (api, _game, id) =>
      new Promise<number>((resolve) => {
        const tile = document.querySelector(
          `#camera-views .mav-dock-tile[data-participant-id="${id}"]`,
        );
        if (!tile) {
          resolve(-100);
          return;
        }
        let loudest = -100;
        const off = api.meters.subscribe(id, tile, ({ db }) => {
          loudest = Math.max(loudest, db);
        });
        setTimeout(() => {
          off();
          resolve(loudest);
        }, 4000);
      }),
    speaker,
  );

let fx: Browser | null = null;
let open: Player[] = [];

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
  await fx?.close();
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

test("a player in an installed Firefox is heard before their first click on the game page", async ({
  browser,
}) => {
  test.skip(!EXE, "MAV_FIREFOX_EXE isn't set");
  if (!EXE) return;
  fx = await firefox.launch({
    channel: "moz-firefox",
    executablePath: EXE,
    headless: false,
    firefoxUserPrefs: PREFS,
  });
  await configureWorld(browser, usesCloud() ? "livekit" : "p2p", "dock");
  const gm = await openGm(browser);
  const p1 = await openPlayer(fx, "Player1");
  open = [gm, p1];
  for (const player of [gm, p1]) await setVoiceMode(player, "always");
  for (const player of [gm, p1]) await expectStatus(player, "connected");
  const gmId = await idOf(p1, "Gamemaster");
  const p1Id = await idOf(gm, "Player1");
  await expect
    .poll(async () => (await gm.state()).participants[p1Id]?.hasAudio, {
      timeout: 60_000,
    })
    .toBe(true);

  // No click on this page yet: only the one on the join page before it.
  await expect
    .poll(() => loudness(gm, p1Id), { timeout: 30_000 })
    .toBeGreaterThan(HEARD_DB);
  await expect
    .poll(() => loudness(p1, gmId), { timeout: 30_000 })
    .toBeGreaterThan(HEARD_DB);
  expect(p1.notices).toEqual([]);
});
