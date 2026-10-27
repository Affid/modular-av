// The core's "Voice & Video Settings" window in Foundry: it fits the
// screen, scrolls its content, and moves by its header like any window.
import { expect, test } from "@playwright/test";
import { configureWorld, openGm, type Player } from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "dock");
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test("the settings window fits the screen, scrolls and moves", async ({
  browser,
}) => {
  // The GM sees every section: the tallest window.
  const gm = await openGm(browser);
  open = [gm];
  await expect(gm.page.locator("#camera-views .mav-dock")).toBeVisible();

  await gm.page.locator(".mav-dock-settings").click();

  const window = gm.page.locator("#modular-av-settings");
  await expect(window.locator(".mav-settings")).toBeVisible();
  const viewport = gm.page.viewportSize() ?? { width: 0, height: 0 };
  await expect
    .poll(async () => {
      const box = await window.boundingBox();
      return box ? box.y >= 0 && box.y + box.height <= viewport.height : false;
    })
    .toBe(true);
  // Everything is reachable: the content scrolls to its last section.
  const scrolled = await window
    .locator(".window-content")
    .evaluate((content) => {
      content.scrollTop = content.scrollHeight;
      return (
        content.scrollTop > 0 || content.scrollHeight <= content.clientHeight
      );
    });
  expect(scrolled).toBe(true);
  await expect(
    window.getByRole("button", { name: "Foundry's A/V settings" }),
  ).toBeInViewport();

  // And it moves by its header.
  const before = await window.boundingBox();
  const header = window.locator(".window-header .window-title");
  const grip = await header.boundingBox();
  if (!before || !grip) throw new Error("no window");
  await gm.page.mouse.move(grip.x + 10, grip.y + grip.height / 2);
  await gm.page.mouse.down();
  await gm.page.mouse.move(grip.x - 110, grip.y + grip.height / 2 + 40, {
    steps: 5,
  });
  await gm.page.mouse.up();
  const after = await window.boundingBox();
  expect(Math.round((after?.x ?? 0) - before.x)).toBe(-120);
});
