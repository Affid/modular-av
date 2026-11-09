import { expect, test } from "@playwright/test";
import { capturedSize } from "./captured-size.ts";

test("the camera opens at the browser's own size by default", async ({
  page,
}) => {
  expect(await capturedSize(page, "default")).toBe("640x480");
});

test("the camera opens at the chosen size", async ({ page }) => {
  expect(await capturedSize(page, "720p")).toBe("1280x720");
  expect(await capturedSize(page, "1080p")).toBe("1920x1080");
});
