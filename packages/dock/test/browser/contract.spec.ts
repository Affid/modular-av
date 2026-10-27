import { uiContract, type UIDriver } from "@modular-av/testing/contract/ui";
import type { Page } from "@playwright/test";

const panel = (page: Page) => page.locator(".mav-dock-panel");

const placement = async (page: Page, name: string): Promise<void> => {
  await page.locator(".mav-dock-placement").click();
  await page.getByRole("menuitemradio", { name }).click();
};

const dock: UIDriver = {
  module: "dock",
  moduleId: "modular-av-dock",
  control(page, control) {
    const names = {
      mute: ".mav-dock-mute",
      deafen: ".mav-dock-deafen",
      camera: ".mav-dock-video",
      leave: ".mav-dock-leave",
      action: ".mav-dock-action",
      settings: ".mav-dock-settings",
      quick: ".mav-dock-quick",
    } as const;
    return panel(page).locator(names[control]);
  },
  warnings: (page) => panel(page).locator(".mav-dock-warnings"),
  async openMenu(page, participant) {
    const tile = page.locator(`[data-participant-id="${participant}"]`);
    await tile.hover();
    await tile.locator(".mav-dock-tile-menu").click();
    return page.getByRole("dialog").last();
  },
  async openQuickControls(page) {
    await panel(page).locator(".mav-dock-quick").click();
    return page.getByRole("dialog").last();
  },
  async openConnectionDetails(page, menu) {
    await menu.getByRole("button", { name: "Connection details" }).click();
    return page.getByRole("dialog", { name: "Connection details" });
  },
  async openWindow(page) {
    await placement(page, "In a window of its own");
  },
};

uiContract(dock);

uiContract({
  ...dock,
  variant: "scattered",
  async prepare(page) {
    await placement(page, "Scattered over the screen");
  },
});
