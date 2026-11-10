// Takes the screenshots in docs/images from the local Foundry world
// (docs/LOCAL-SETUP.md): four users in a P2P call, each on a browser of
// their own with a video file as its camera.
//
//   node scripts/docs/screenshots.ts <directory with gm.y4m, p1.y4m, p2.y4m, p3.y4m> [map image]
//
// With a map image, the viewer sees it as a scene made for the pictures
// and deleted afterwards.
//
// The camera files aren't in the repository: see docs/images/README.md.
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
  type Browser,
  chromium,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  openPlayer,
  type Player,
  turnOffEffects,
} from "../../tests/foundry/world.ts";
import { loadFoundryEnv } from "../foundry/env.ts";
import { FAKE_SPEECH_WAV, writeFakeSpeech } from "../foundry/fake-speech.ts";

const OUT = resolve("docs/images");
const VIEWPORT = { width: 1440, height: 900 } as const;
const CAST = [
  { user: "Gamemaster", feed: "gm.y4m" },
  { user: "Player1", feed: "p1.y4m" },
  { user: "Player2", feed: "p2.y4m" },
  { user: "Player3", feed: "p3.y4m" },
] as const;
/** Time for every camera to arrive and the speaking rings to settle. */
const SETTLE_MS = 8_000;
const BACKGROUND_MS = 15_000;
/** Held back from releases: its settings don't belong in the pictures. */
const UNRELEASED = "modular-av-livekit-krisp";

const launch = (feed: string): Promise<Browser> =>
  chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--allow-loopback-in-peer-connection",
      `--use-file-for-fake-audio-capture=${FAKE_SPEECH_WAV}`,
      `--use-file-for-fake-video-capture=${feed}`,
    ],
  });

const shot = (target: Page | Locator, name: string): Promise<Buffer> =>
  target.screenshot({ path: join(OUT, `${name}.png`) });

/** The top left corner of the page, where the docked dock is. */
const corner = (
  page: Page,
  name: string,
  width: number,
  height: number,
): Promise<Buffer> =>
  page.screenshot({
    path: join(OUT, `${name}.png`),
    clip: { x: 0, y: 0, width, height },
  });

/** Foundry asks a player with no character to configure their user. */
async function closeUserConfig(page: Page): Promise<void> {
  const close = page.locator(
    '.application:has-text("User Configuration") [data-action="close"]',
  );
  if ((await close.count()) > 0) await close.first().click();
}

interface DocsScene {
  readonly id: string;
  /** The map's copy in the world's folder. */
  readonly file: string;
}

/** A scene with `map` as its background, active for everyone. */
async function createScene(gm: Player, map: string): Promise<DocsScene> {
  const world = await gm.page.evaluate(
    () =>
      (globalThis as unknown as { game: { world: { id: string } } }).game.world
        .id,
  );
  const name = `docs-map${extname(map)}`;
  const file = join(loadFoundryEnv().dataDir, "Data", "worlds", world, name);
  copyFileSync(map, file);
  const id = await gm.page.evaluate(async (src) => {
    const g = globalThis as unknown as {
      Scene: { create(data: object): Promise<{ id: string }> };
    };
    const scene = await g.Scene.create({
      name: "The cavern",
      active: true,
      navigation: false,
      // Foundry v14 keeps a scene's picture on its levels.
      levels: [{ name: "Ground", background: { src } }],
      width: 2000,
      height: 2000,
      padding: 0,
      grid: { type: 0 },
      tokenVision: false,
      initial: { x: 1000, y: 1000, scale: 0.75 },
    });
    return scene.id;
  }, `worlds/${world}/${name}`);
  return { id, file };
}

async function removeScene(gm: Player, scene: DocsScene): Promise<void> {
  await gm.page.evaluate(async (id) => {
    const g = globalThis as unknown as {
      game: {
        scenes: { get(id: string): { delete(): Promise<unknown> } | undefined };
      };
    };
    await g.game.scenes.get(id)?.delete();
  }, scene.id);
  rmSync(scene.file, { force: true });
}

/** Foundry's canvas on for this player: the others stay without (session.ts). */
async function showCanvas(player: Player): Promise<void> {
  await player.page.context().addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
  });
  await player.page.reload();
  await player.page.waitForFunction(
    () =>
      (globalThis as { canvas?: { ready?: boolean } }).canvas?.ready === true,
    null,
    { timeout: 120_000 },
  );
  await expectStatus(player, "connected");
  await closeUserConfig(player.page);
  // Headless Chrome has no GPU, and Foundry's warning about it never leaves.
  await player.page.locator("#notifications > *").evaluateAll((notices) => {
    for (const notice of notices) notice.remove();
  });
}

/** Turns a module on or off for the world; returns what it was. */
async function setModule(
  browser: Browser,
  id: string,
  on: boolean,
): Promise<boolean> {
  const gm = await openPlayer(browser, "Gamemaster");
  const was = await gm.page.evaluate(
    async (to) => {
      const g = globalThis as unknown as {
        game: {
          settings: {
            get(ns: string, key: string): Record<string, boolean>;
            set(ns: string, key: string, value: object): Promise<unknown>;
          };
        };
      };
      const current = g.game.settings.get("core", "moduleConfiguration");
      const before = current[to.id] === true;
      if (before !== to.on)
        await g.game.settings.set("core", "moduleConfiguration", {
          ...current,
          [to.id]: to.on,
        });
      return before;
    },
    { id, on },
  );
  await gm.close();
  return was;
}

/** The pause banner carries the game system's logo: not ours to publish. */
const setPaused = (gm: Player, paused: boolean): Promise<void> =>
  gm.page.evaluate((to) => {
    const g = globalThis as unknown as {
      game: { togglePause(paused: boolean, options: object): void };
    };
    g.game.togglePause(to, { broadcast: true });
  }, paused);

/** The dock's own settings back to their defaults (kept with the user). */
async function resetDock(player: Player): Promise<void> {
  await player.run(async (_api, game) => {
    await game.settings.set("modular-av-dock", "mode", "docked");
    await game.settings.set("modular-av-dock", "theme", "");
  }, null);
}

async function shootDock(viewer: Player): Promise<void> {
  const page = viewer.page;
  await page.locator(".mav-dock-placement").click();
  await page.waitForTimeout(500);
  await corner(page, "dock-placement-menu", 450, 410);
  await page
    .getByRole("menuitemradio", { name: /Scattered over the screen/ })
    .click();
  await viewer.run(async (_api, game) => {
    await game.settings.set("modular-av-dock", "theme", "vines");
  }, null);
  await page.waitForTimeout(3_000);
  await shot(page, "dock-scattered-vines");
}

async function shootSettingsAndMixer(player: Player): Promise<void> {
  const page = player.page;
  await shot(page.locator("#camera-views .mav-dock-panel"), "voice-panel");
  await player.run(async (api) => {
    for (const id of ["rnnoise", "eq", "radio", "reverb", "echo"])
      if (api.effects.get(id)) await api.commands.setEffectEnabled(id, true);
  }, null);
  await page.locator(".mav-dock-settings").click();
  const settings = page.locator("#modular-av-settings");
  await settings.locator('[data-tab="voice"]').click();
  await page.waitForTimeout(1_000);
  await shot(settings, "settings-voice");
  await settings.getByRole("button", { name: "Audio mixer" }).click();
  const mixer = page.locator("#modular-av-audio-mixer");
  await mixer.locator(".mav-mixer").waitFor();
  await page.waitForTimeout(1_500);
  await shot(mixer, "audio-mixer");
  await mixer.locator('[data-action="close"]').first().click();
  await settings.locator('[data-action="close"]').first().click();
}

/** A GM's views: a player's menu, and that player's voice in the mixer. */
async function shootGm(gm: Player, playerId: string): Promise<void> {
  const page = gm.page;
  const tile = page.locator(
    `#camera-views .mav-dock-tile[data-participant-id="${playerId}"]`,
  );
  await tile.hover();
  await tile.locator(".mav-dock-tile-menu").click();
  await page.waitForTimeout(500);
  await corner(page, "player-menu", 560, 760);
  await page.keyboard.press("Escape");

  await page.locator(".mav-dock-settings").click();
  const settings = page.locator("#modular-av-settings");
  await settings.locator('[data-tab="voice"]').click();
  await settings.getByRole("button", { name: "Audio mixer" }).click();
  const mixer = page.locator("#modular-av-audio-mixer");
  await mixer.locator('[data-tab="table"]').click();
  await mixer.locator('[data-field="player"]').selectOption(playerId);
  await page.waitForTimeout(1_500);
  await shot(mixer, "audio-mixer-table");
  await mixer.locator('[data-action="close"]').first().click();
  await settings.locator('[data-action="close"]').first().click();
}

/** A player's own camera as it is, blurred and with a background. */
async function shootBackground(player: Player, ownId: string): Promise<void> {
  const tile = player.page.locator(
    `#camera-views .mav-dock-tile[data-participant-id="${ownId}"]`,
  );
  const set = (id: string, on: boolean): Promise<void> =>
    player.run(
      (api, _game, to) => api.commands.setEffectEnabled(to.id, to.on),
      {
        id,
        on,
      },
    );
  await shot(tile, "cam-background-off");
  for (const mode of ["blur", "replace"]) {
    await set(`background-${mode}`, true);
    // Without a GPU the effect takes a while to start, and runs slowly.
    await player.page.waitForTimeout(BACKGROUND_MS);
    await shot(tile, `cam-background-${mode}`);
  }
}

async function shootModules(gm: Player): Promise<void> {
  await gm.run(async (_api, game) => {
    await game.settings.set("modular-av", "modulesPlan", null);
    await game.settings.set("modular-av", "checkGitHub", false);
  }, null);
  await gm.page.locator('#sidebar-tabs [data-tab="settings"]').click();
  await gm.page.locator('button[data-app="configure"]').click();
  const config = gm.page.locator("#settings-config");
  for (const service of ["livekit", "jitsi"]) {
    await config.locator(`[data-tab="modular-av-${service}"]`).first().click();
    await gm.page.waitForTimeout(500);
    await shot(config, `settings-${service}`);
  }
  await config.locator('[data-tab="modular-av"]').first().click();
  await gm.page.getByRole("button", { name: "Plan your modules" }).click();
  const board = gm.page.locator("#modular-av-modules");
  await board.locator(".mav-board-next").waitFor();
  await gm.page.waitForTimeout(1_000);
  await shot(board, "plan-your-modules");
}

async function main(): Promise<void> {
  const feeds = resolve(process.argv[2] ?? "");
  const missing = CAST.filter((c) => !existsSync(join(feeds, c.feed)));
  if (!process.argv[2] || missing.length > 0)
    throw new Error(
      `Pass a directory holding ${CAST.map((c) => c.feed).join(", ")}`,
    );
  if (!existsSync(FAKE_SPEECH_WAV)) writeFakeSpeech();
  mkdirSync(OUT, { recursive: true });

  const browsers = await Promise.all(
    CAST.map((c) => launch(join(feeds, c.feed))),
  );
  const [first] = browsers;
  if (!first) throw new Error("No browser");
  const map = process.argv[3] ? resolve(process.argv[3]) : null;
  let players: readonly Player[] = [];
  let scene: DocsScene | null = null;
  let unreleasedWasOn = false;
  try {
    await configureWorld(first, "p2p", "dock");
    unreleasedWasOn = await setModule(first, UNRELEASED, false);
    for (const [index, member] of CAST.entries()) {
      const browser = browsers[index];
      if (!browser) throw new Error("No browser");
      const player = await openPlayer(browser, member.user, {
        viewport: VIEWPORT,
      });
      players = [...players, player];
    }
    for (const player of players) {
      await expectStatus(player, "connected");
      await closeUserConfig(player.page);
    }
    const [gm, p1, p2] = players;
    if (!gm || !p1 || !p2) throw new Error("No players");
    const p1Id = await idOf(gm, "Player1");
    const p2Id = await idOf(gm, "Player2");
    await setPaused(gm, false);
    if (map) {
      scene = await createScene(gm, map);
      await showCanvas(p1);
    }
    await p1.page.waitForTimeout(SETTLE_MS);

    // The dock last: it leaves the viewer's layout scattered.
    await shootSettingsAndMixer(p1);
    await shootGm(gm, p1Id);
    await shootModules(gm);
    await shootBackground(p2, p2Id);
    await shootDock(p1);
  } finally {
    // A logged-in user can't log in again: everyone leaves first.
    const [gm] = players;
    if (gm) await setPaused(gm, true).catch(() => undefined);
    if (gm && scene)
      await removeScene(gm, scene).catch((error: unknown) => {
        console.error("The scene wasn't removed:", error);
      });
    for (const player of players) {
      await turnOffEffects(player).catch(() => undefined);
      await resetDock(player).catch(() => undefined);
      await player.close();
    }
    if (unreleasedWasOn)
      await setModule(first, UNRELEASED, true).catch((error: unknown) => {
        console.error(`${UNRELEASED} wasn't turned back on:`, error);
      });
    await configureWorld(first, "livekit", "foundry").catch(
      (error: unknown) => {
        console.error("The world wasn't set back:", error);
      },
    );
    await Promise.all(browsers.map((b) => b.close()));
  }
}

await main();
