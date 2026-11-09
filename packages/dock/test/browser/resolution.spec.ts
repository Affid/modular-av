import { expect, type Page, test } from "@playwright/test";

/** "WxH" of the camera the core sends; "" while it sends none. */
const sentSize = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const camera = window.harness?.pipeline?.track("camera");
    if (camera?.readyState !== "live") return "";
    const { width, height } = camera.getSettings();
    return `${String(width)}x${String(height)}`;
  });

// Chrome holds a camera once for every capture of it, at the size it opened
// at: the window's own preview must not keep the call's camera small.
test("a resolution saved in the settings window reaches the call's camera while its preview shows", async ({
  page,
}) => {
  // Arrange
  await page.goto("/?module=dock&service=mock");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect.poll(() => sentSize(page), { timeout: 20_000 }).toBe("640x480");
  await page.locator(".mav-dock-settings").click();
  await page.getByRole("tab", { name: "Video" }).click();
  await expect(page.locator(".mav-settings-preview video")).toHaveJSProperty(
    "readyState",
    4,
  );

  // Act
  await page.getByLabel("Resolution").selectOption("720p");
  await page.getByRole("button", { name: "Save" }).click();

  // Assert
  await expect.poll(() => sentSize(page), { timeout: 10_000 }).toBe("1280x720");
  await expect
    .poll(() =>
      page
        .locator(".mav-settings-preview video")
        .evaluate((v: HTMLVideoElement) => `${v.videoWidth}x${v.videoHeight}`),
    )
    .toBe("1280x720");
});
