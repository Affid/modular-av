// A scene with a map behind the dock, for pictures taken in the local
// Foundry (scripts/docs/screenshots.ts, scripts/themes/foundry-check.ts):
// made for the pictures and deleted afterwards.
import { copyFileSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import type { Page } from "@playwright/test";
import { expectStatus, type Player } from "../../tests/foundry/world.ts";
import { loadFoundryEnv } from "./env.ts";

/** Foundry asks a player with no character to configure their user. */
export async function closeUserConfig(page: Page): Promise<void> {
  const close = page.locator(
    '.application:has-text("User Configuration") [data-action="close"]',
  );
  if ((await close.count()) > 0) await close.first().click();
}

export interface MapScene {
  readonly id: string;
  /** The map's copy in the world's folder. */
  readonly file: string;
}

/** A scene with `map` as its background, active for everyone. */
export async function createScene(gm: Player, map: string): Promise<MapScene> {
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

export async function removeScene(gm: Player, scene: MapScene): Promise<void> {
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
export async function showCanvas(player: Player): Promise<void> {
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

/** The pause banner carries the game system's logo: not ours to publish. */
export const setPaused = (gm: Player, paused: boolean): Promise<void> =>
  gm.page.evaluate((to) => {
    const g = globalThis as unknown as {
      game: { togglePause(paused: boolean, options: object): void };
    };
    g.game.togglePause(to, { broadcast: true });
  }, paused);
