// The voice panel keeps its size while warnings come and go (speaking
// while muted turns on and off as the player talks).
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 } });

async function call(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?module=dock&service=mock&sample=1&players=p1");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-status")).toHaveAttribute(
    "data-status",
    "connected",
    { timeout: 20_000 },
  );
  await expect(page.locator(".mav-dock-connection-status")).toBeVisible();
}

/** A warning as the dock shows one, put in by hand: the layout is the test. */
const warn = (page: Page): Promise<void> =>
  page.locator(".mav-dock-warnings").evaluate((warnings) => {
    const icon = document.createElement("span");
    icon.className = "mav-indicator";
    icon.dataset.indicator = "speaking-while-muted";
    icon.textContent = "!";
    warnings.append(icon);
  });

const heightOf = async (page: Page): Promise<number> =>
  Math.round(
    (await page.locator(".mav-dock-panel").boundingBox())?.height ?? 0,
  );

for (const placement of ["Docked on the left", "Docked at the top"]) {
  test(`${placement}, a warning doesn't change the panel's height`, async ({
    page,
  }) => {
    await call(page);
    await page.locator(".mav-dock-placement").click();
    await page.getByRole("menuitemradio", { name: placement }).click();
    const before = await heightOf(page);

    await warn(page);

    await expect(
      page.locator(".mav-dock-warnings .mav-indicator"),
    ).toBeVisible();
    expect(await heightOf(page)).toBe(before);
    // Beside the connection line, not over it.
    const line = await page
      .locator(".mav-dock-connection-status")
      .boundingBox();
    const icon = await page
      .locator(".mav-dock-warnings .mav-indicator")
      .boundingBox();
    expect((icon?.x ?? 0) + 1).toBeGreaterThan(
      (line?.x ?? 0) + (line?.width ?? 0),
    );
  });
}

test("the microphone's arrow closes its menu when clicked again", async ({
  page,
}) => {
  await call(page);
  const arrow = page.getByRole("button", { name: "Microphone options" });

  await arrow.click();
  await expect(page.locator(".mav-popover")).toBeVisible();
  await arrow.click();

  await expect(page.locator(".mav-popover")).toHaveCount(0);
  await expect(arrow).toHaveAttribute("aria-expanded", "false");
});
