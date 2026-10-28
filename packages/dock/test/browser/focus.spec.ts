// "Show one player large": that player large, everyone else as thumbnails
// (under them on a side, beside them at the top or bottom).
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 900 } });

async function widthOf(target: Locator): Promise<number> {
  return Math.round((await target.boundingBox())?.width ?? 0);
}

async function focusLayout(page: Page, placement: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?module=dock&service=mock&sample=1&players=p1,p2,p3");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile")).toHaveCount(4, {
    timeout: 30_000,
  });
  if (placement !== "Docked on the left") {
    await page.locator(".mav-dock-placement").click();
    await page.getByRole("menuitemradio", { name: placement }).click();
  }
  await page.getByRole("button", { name: "Show one player large" }).click();
}

for (const placement of ["Docked on the left", "Docked at the top"]) {
  test(`${placement}, one player is large and the others are thumbnails`, async ({
    page,
  }) => {
    await focusLayout(page, placement);
    const large = page.locator(".mav-dock-tile[data-focused]");
    const others = page.locator(".mav-dock-tile:not([data-focused])");

    await expect(others).toHaveCount(3);
    for (const thumb of await others.all())
      expect(await widthOf(large)).toBeGreaterThanOrEqual(
        1.9 * (await widthOf(thumb)),
      );
    // Not the player's own camera, unless they pick it.
    await expect(large).not.toHaveAttribute("data-participant-id", "gm1");
  });
}

test("everyone the same size again from the same button", async ({ page }) => {
  await focusLayout(page, "Docked on the left");

  await page
    .getByRole("button", { name: "Show everyone the same size" })
    .click();

  // The grid is fitted again a frame later: wait for it.
  const sizes = async (): Promise<number> => {
    const widths = new Set<number>();
    for (const tile of await page.locator(".mav-dock-tile").all())
      widths.add(await widthOf(tile));
    return widths.size;
  };
  await expect.poll(sizes).toBe(1);
});
