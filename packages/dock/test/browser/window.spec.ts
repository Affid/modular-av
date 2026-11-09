import { expect, type Page, test } from "@playwright/test";

/** The dock in the harness with two other players, connected. */
async function openDock(page: Page): Promise<void> {
  await page.goto("/?module=dock&service=mock&players=p1,p2");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator("[data-status]").first()).toHaveAttribute(
    "data-status",
    "connected",
    { timeout: 20_000 },
  );
}

/** From a click, as a browser asks: resolves with the window's page. */
async function openWindow(page: Page): Promise<Page> {
  await page.locator(".mav-dock-placement").click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("menuitemradio", { name: "In a window of its own" }).click(),
  ]);
  await expect(popup.locator(".mav-dock")).toBeVisible();
  return popup;
}

test("the dock's own window goes full screen and back", async ({ page }) => {
  // Arrange
  await openDock(page);
  const popup = await openWindow(page);
  const button = popup.locator(".mav-dock-fullscreen");

  // Act
  await button.click();

  // Assert
  await expect
    .poll(() => popup.evaluate(() => document.fullscreenElement !== null))
    .toBe(true);
  await expect(button).toHaveAccessibleName("Leave full screen");
  await button.click();
  await expect
    .poll(() => popup.evaluate(() => document.fullscreenElement !== null))
    .toBe(false);
  await expect(button).toHaveAccessibleName("Full screen");
});

test("the dock's own window closes with Foundry's page", async ({ page }) => {
  await openDock(page);
  const popup = await openWindow(page);

  await page.goto("about:blank");

  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("Foundry's page offers no full screen for the docked cameras", async ({
  page,
}) => {
  await openDock(page);

  await expect(page.locator(".mav-dock-fullscreen")).toBeHidden();
});
