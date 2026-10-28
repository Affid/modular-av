// Collapsed on a side: a narrow rail of buttons that gives Foundry the
// column back, as the slim bar does at the top or bottom.
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 } });

const boxOf = async (target: Locator) => {
  const box = await target.boundingBox();
  if (!box) throw new Error("not on screen");
  return box;
};

for (const side of ["left", "right"]) {
  test(`collapsed on the ${side}, the dock is a narrow rail of its buttons`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?module=dock&service=mock&sample=1&players=p1");
    await page.waitForFunction(() => window.harness !== undefined);
    await expect(page.locator(".mav-dock-connection-status")).toBeVisible({
      timeout: 20_000,
    });
    if (side === "right") {
      await page.locator(".mav-dock-placement").click();
      await page
        .getByRole("menuitemradio", { name: "Docked on the right" })
        .click();
    }

    await page.getByRole("button", { name: "Hide the cameras" }).click();

    const host = await boxOf(page.locator("#camera-views"));
    expect(host.width).toBeLessThanOrEqual(60);
    const buttons = page.locator(
      ".mav-dock-header button:visible, .mav-dock-buttons > button:visible",
    );
    expect(await buttons.count()).toBeGreaterThanOrEqual(7);
    for (const button of await buttons.all()) {
      const box = await boxOf(button);
      expect(box.x).toBeGreaterThanOrEqual(host.x);
      expect(box.x + box.width).toBeLessThanOrEqual(host.x + host.width + 1);
    }
    await expect(
      page.getByRole("button", { name: "Show the cameras" }),
    ).toBeVisible();
    await expect(page.locator(".mav-dock-status")).toBeVisible();

    // The arrow keys skip what the rail hides (the menus' arrows).
    await page.locator(".mav-dock-mute").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".mav-dock-deafen")).toBeFocused();
  });
}
