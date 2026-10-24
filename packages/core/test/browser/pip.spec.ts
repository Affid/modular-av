import type { ModularAV, PipWindow } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

declare global {
  interface Window {
    pipResult?: string;
    pipOpened?: PipWindow;
    pipClosed?: number;
  }
}

/** A button that asks the core for the window, as a UI module would. */
async function openHarness(page: Page): Promise<void> {
  await page.goto("/?module=core");
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      ModularAV | undefined;
    const style = document.createElement("style");
    style.textContent = ".probe { color: rgb(1, 2, 3); }";
    document.head.append(style);
    document.body.classList.add("theme-dark");
    const button = document.createElement("button");
    button.id = "open-pip";
    button.textContent = "Open";
    button.addEventListener("click", () => {
      api?.windows.pip
        .request("test-ui", { width: 300, height: 200, title: "Cameras" })
        .then((opened) => {
          window.pipOpened = opened;
          window.pipClosed = 0;
          opened.onClose(() => {
            window.pipClosed = (window.pipClosed ?? 0) + 1;
          });
          window.pipResult = "opened";
        })
        .catch((error: unknown) => {
          window.pipResult = `error ${(error as { code?: string }).code ?? ""}`;
        });
    });
    document.body.append(button);
  });
}

test("a click opens the window with the page's styles and theme", async ({
  page,
}) => {
  await openHarness(page);

  await page.click("#open-pip");
  await expect.poll(() => page.evaluate(() => window.pipResult)).toBe("opened");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = window.pipOpened?.document;
        if (!doc) return null;
        const probe = doc.createElement("span");
        probe.className = "probe";
        doc.body.append(probe);
        return {
          title: doc.title,
          body: doc.body.className,
          color: getComputedStyle(probe).color,
        };
      }),
    )
    .toEqual({
      title: "Cameras",
      body: "theme-dark modular-av-pip",
      color: "rgb(1, 2, 3)",
    });
});

test("closing the window tells its owner once and frees it", async ({
  page,
}) => {
  await openHarness(page);
  await page.click("#open-pip");
  await expect.poll(() => page.evaluate(() => window.pipResult)).toBe("opened");

  await page.evaluate(() => {
    window.pipOpened?.close();
  });

  await expect.poll(() => page.evaluate(() => window.pipClosed)).toBe(1);
  expect(
    await page.evaluate(() => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        ModularAV | undefined;
      return api?.windows.pip.current ?? null;
    }),
  ).toBeNull();
});
