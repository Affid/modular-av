// A theme in the real thing: four users of the local Foundry world
// (docs/LOCAL-SETUP.md) in a P2P call, and the GM's dock under the theme
// in every placement. For each: a picture, what the dock says of its
// layout, and whether anything scrolls. At the end, the page's errors.
//
//   node scripts/themes/foundry-check.ts <folder for the pictures> <theme id> [folder with gm.y4m, p1.y4m, p2.y4m, p3.y4m]
//
// Foundry must be running with the test world (pnpm foundry:start,
// pnpm foundry:setup) and the modules built and linked. Without camera
// files (docs/images/README.md) everyone has Chrome's test pattern.
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  openPlayer,
  type Player,
} from "../../tests/foundry/world.ts";
import { PLACEMENTS, type PlacementName } from "../../tools/themes/options.ts";
import { FAKE_SPEECH_WAV, writeFakeSpeech } from "../foundry/fake-speech.ts";

const VIEWPORT = { width: 1440, height: 900 } as const;
const CAST = [
  { user: "Gamemaster", feed: "gm.y4m" },
  { user: "Player1", feed: "p1.y4m" },
  { user: "Player2", feed: "p2.y4m" },
  { user: "Player3", feed: "p3.y4m" },
] as const;
/** Time for every camera to arrive and the theme's pictures to load. */
const SETTLE_MS = 8_000;
const MOVE_MS = 3_000;

const launch = (feed: string | null): Promise<Browser> =>
  chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--allow-loopback-in-peer-connection",
      `--use-file-for-fake-audio-capture=${FAKE_SPEECH_WAV}`,
      ...(feed ? [`--use-file-for-fake-video-capture=${feed}`] : []),
    ],
  });

/** What the dock says of itself, and whether its list scrolls. */
const told = (page: Page): Promise<object> =>
  page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>("#camera-views .mav-dock");
    const list = dock?.querySelector<HTMLElement>(".mav-dock-tiles");
    const tiles = [
      ...(dock?.querySelectorAll<HTMLElement>(".mav-dock-tile") ?? []),
    ];
    const box = dock?.getBoundingClientRect();
    return {
      placement: dock?.dataset.placement,
      dock: [Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)],
      tile: Math.round(tiles[0]?.getBoundingClientRect().width ?? 0),
      spare: list?.style.getPropertyValue("--mav-dock-spare"),
      rooms: tiles.map((tile) =>
        tile.style.getPropertyValue("--mav-dock-tile-room"),
      ),
      scrolls: list
        ? [
            list.scrollWidth - list.clientWidth,
            list.scrollHeight - list.clientHeight,
          ]
        : null,
    };
  });

/** The GM's dock in each placement, and with one camera large: a picture and a line each. */
async function tour(gm: Player, out: string): Promise<void> {
  const page = gm.page;
  const report = async (name: string): Promise<void> => {
    console.log(`${name}: ${JSON.stringify(await told(page))}`);
    await page.screenshot({ path: join(out, `${name}.png`) });
  };
  await report("left");
  await page.locator("#camera-views .mav-dock-layout").click();
  await page.waitForTimeout(MOVE_MS);
  await report("left-one-large");
  await page.locator("#camera-views .mav-dock-layout").click();
  const others = (Object.keys(PLACEMENTS) as PlacementName[]).filter(
    (name) => name !== "left",
  );
  for (const name of others) {
    await page.locator(".mav-dock-placement").first().click();
    await page
      .getByRole("menuitemradio", { name: new RegExp(`^${PLACEMENTS[name]}`) })
      .click();
    await page.waitForTimeout(MOVE_MS);
    await report(name);
  }
}

/** The dock's own settings back to their defaults (kept with the user). */
const resetDock = (player: Player): Promise<void> =>
  player.run(async (_api, game) => {
    await game.settings.set("modular-av-dock", "mode", "docked");
    await game.settings.set("modular-av-dock", "theme", "");
  }, null);

async function main(): Promise<void> {
  const [outArg, theme, feedsArg] = process.argv.slice(2);
  if (!outArg || !theme)
    throw new Error(
      "Usage: node scripts/themes/foundry-check.ts <folder for the pictures> <theme id> [folder with camera files]",
    );
  const out = resolve(outArg);
  const feeds = feedsArg ? resolve(feedsArg) : null;
  const missing = CAST.filter((c) => feeds && !existsSync(join(feeds, c.feed)));
  if (missing.length > 0)
    throw new Error(
      `No ${missing.map((c) => c.feed).join(", ")} in ${String(feeds)}`,
    );
  if (!existsSync(FAKE_SPEECH_WAV)) writeFakeSpeech();
  mkdirSync(out, { recursive: true });

  const browsers = await Promise.all(
    CAST.map((c) => launch(feeds ? join(feeds, c.feed) : null)),
  );
  const [first] = browsers;
  if (!first) throw new Error("No browser");
  let players: readonly Player[] = [];
  const errors = new Set<string>();
  try {
    await configureWorld(first, "p2p", "dock");
    for (const [index, member] of CAST.entries()) {
      const browser = browsers[index];
      if (!browser) throw new Error("No browser");
      players = [
        ...players,
        await openPlayer(browser, member.user, { viewport: VIEWPORT }),
      ];
    }
    for (const player of players) await expectStatus(player, "connected");
    const [gm] = players;
    if (!gm) throw new Error("No players");
    gm.page.on("console", (message) => {
      if (message.type() === "error") errors.add(message.text().slice(0, 300));
    });
    gm.page.on("pageerror", (error) =>
      errors.add(`Uncaught: ${error.message}`),
    );
    await gm.run(async (_api, game, id) => {
      await game.settings.set("modular-av-dock", "theme", id);
    }, theme);
    await gm.page.waitForTimeout(SETTLE_MS);
    await tour(gm, out);
  } finally {
    // A logged-in user can't log in again: everyone leaves first.
    for (const player of players) {
      await resetDock(player).catch(() => undefined);
      await player.close();
    }
    await configureWorld(first, "livekit", "foundry").catch(
      (error: unknown) => {
        console.error("The world wasn't set back:", error);
      },
    );
    await Promise.all(browsers.map((browser) => browser.close()));
  }
  console.log(
    errors.size === 0
      ? "No errors on the GM's page."
      : `Errors on the GM's page:\n${[...errors].join("\n")}`,
  );
  if (errors.size > 0) process.exitCode = 1;
}

await main();
