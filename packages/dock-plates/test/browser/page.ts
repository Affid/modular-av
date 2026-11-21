// What the plates theme's browser tests share: opening the harness with
// the theme chosen, moving the dock, and reading painted styles.
import type { ModularAV } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page } from "@playwright/test";

export const MODULES = "dock,dock-plates";

/**
 * The harness with `players` others in the call, under the theme (or the
 * dock's own look with ""). `more` is added to its address, e.g. `&sample=1`
 * for the sample module's badge.
 */
export async function open(
  page: Page,
  players: number,
  theme = "plates",
  more = "",
): Promise<void> {
  const ids = Array.from({ length: players }, (_, i) => `p${String(i + 1)}`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    `/?module=${MODULES}&service=mock&players=${ids.join(",")}&theme=${theme}${more}`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile[data-connected]")).toHaveCount(
    players + 1,
    { timeout: 30_000 },
  );
  // The harness's page has no height of its own: a docked dock would grow.
  await page.addStyleTag({ content: "#camera-views { height: 100vh }" });
}

export async function place(page: Page, placement: RegExp): Promise<void> {
  await page.locator(".mav-dock-placement").click();
  await page.getByRole("menuitemradio", { name: placement }).click();
}

export async function scatter(page: Page): Promise<void> {
  await place(page, /Scattered over the screen/);
  await expect(
    page.locator(".mav-dock-tile[data-anchor]").first(),
  ).toBeVisible();
}

export type Pseudo = "::before" | "::after";

/** Computed styles of an element, or of one of its pseudo-elements, by property. */
export const styleOf = (
  target: Locator,
  properties: readonly string[],
  pseudo: Pseudo | null = null,
): Promise<Record<string, string>> =>
  target.evaluate(
    (el, [which, names]) => {
      const style = getComputedStyle(el, which);
      return Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name)]),
      );
    },
    [pseudo, properties] as const,
  );

/** One computed style. */
export const style = async (
  target: Locator,
  property: string,
  pseudo: Pseudo | null = null,
): Promise<string> =>
  (await styleOf(target, [property], pseudo))[property] ?? "";

export const dock = (page: Page): Locator => page.locator(".mav-dock");
export const list = (page: Page): Locator => page.locator(".mav-dock-tiles");
export const tileOf = (page: Page, id: string): Locator =>
  page.locator(`.mav-dock-tile[data-participant-id="${id}"]`);
export const frameOf = (tile: Locator): Locator =>
  tile.locator(".mav-dock-tile-frame");

/** The viewer leaves the call: their own plate stays, out of it. */
export const leave = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")
      ?.api as ModularAV;
    return api.commands.leave();
  });

export const speak = (page: Page, id: string, speaking = true): Promise<void> =>
  page.evaluate(([who, on]) => window.harness?.ui?.hub.setSpeaking(who, on), [
    id,
    speaking,
  ] as const);

export const mute = (page: Page, id: string): Promise<void> =>
  page.evaluate(
    (who) => window.harness?.ui?.players[who]?.commands.setMuted(true),
    id,
  );

/** The middle of a box across, and its box, on screen. */
export async function boxOf(target: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  middle: number;
}> {
  const box = await target.boundingBox();
  if (!box) throw new Error("Not on screen");
  return { ...box, middle: box.x + box.width / 2 };
}
