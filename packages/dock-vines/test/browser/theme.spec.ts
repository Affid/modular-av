// The vines theme: the theme contract in each layout, and what the dock
// does with a theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

themeContract({
  modules: "dock,dock-vines",
  theme: "vines",
  layouts: ["Docked on the left", "Floating", "Scattered over the screen"],
});

/** The vines palette's tile background, #122016. */
const VINE_TILE = "rgb(18, 32, 22)";

async function open(page: Page, theme: string): Promise<void> {
  await page.goto(
    `/?module=dock,dock-vines&service=mock&players=p1&theme=${theme}`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile")).toHaveCount(2, {
    timeout: 20_000,
  });
}

test("loads only its own stylesheet, and only while chosen", async ({
  page,
}) => {
  await open(page, "vines");

  await expect(page.locator("html")).toHaveClass(/mav-theme-vines/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-vines/vines.css",
  );
  await expect(page.locator(".mav-dock-tile").first()).toHaveCSS(
    "background-color",
    VINE_TILE,
  );

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect(page.locator(".mav-dock-tile").first()).not.toHaveCSS(
    "background-color",
    VINE_TILE,
  );
});

test("is offered without it: the dock's own look stays", async ({ page }) => {
  await open(page, "");

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await page.locator(".mav-dock-settings").click();
  await page.getByRole("tab", { name: "Appearance" }).click();
  // The harness's user is a GM: one theme, for everyone.
  const choice = page.getByLabel("Theme for everyone", { exact: true });
  await expect(choice).toHaveValue("default");
  await expect(choice.locator("option")).toHaveText([
    "Modular A/V's own look",
    "Vines",
  ]);
});

test("suggests the scattered layout, leaving the dock where it is", async ({
  page,
}) => {
  await open(page, "vines");

  await page.locator(".mav-dock-placement").click();

  await expect(
    page.getByRole("menuitemradio", {
      name: "Scattered over the screen (the theme's suggestion)",
    }),
  ).toBeVisible();
  await expect(page.locator(".mav-dock")).not.toHaveAttribute(
    "data-placement",
    "scattered",
  );
});

test("fits the suggestion's longer label in its menu item, under Foundry's button rule", async ({
  page,
}) => {
  await open(page, "vines");
  // Foundry 14.369's rule for every button, which fixes its height: the
  // label wraps to two lines in the menu.
  await page.addStyleTag({
    content: `@layer elements.forms {
      button {
        --button-size: 2em;
        display: flex;
        justify-content: center;
        align-items: center;
        height: var(--button-size);
        min-height: var(--button-size);
      }
    }`,
  });

  await page.locator(".mav-dock-placement").click();
  const item = page.getByRole("menuitemradio", {
    name: "Scattered over the screen (the theme's suggestion)",
  });

  // The label stays inside the padding, and is centred as the one-line
  // items are by Foundry's rule.
  const fit = await item.evaluate((button) => {
    const label = button.ownerDocument.createRange();
    label.selectNodeContents(button);
    const text = label.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const top = box.top + parseFloat(style.paddingTop);
    const bottom = box.bottom - parseFloat(style.paddingBottom);
    return {
      overflow: Math.max(0, top - text.top) + Math.max(0, text.bottom - bottom),
      align: style.textAlign,
    };
  });
  expect(fit).toEqual({ overflow: 0, align: "center" });
});

for (const { kind, choice } of [
  { kind: "popup", choice: "In a window of its own" },
  { kind: "pip", choice: "In a window always on top" },
] as const)
  test(`follows the dock into its ${kind} window`, async ({ page }) => {
    await open(page, "vines");

    await page.locator(".mav-dock-placement").click();
    await page.getByRole("menuitemradio", { name: choice }).click();

    await expect
      .poll(() =>
        page.evaluate((which) => {
          const api = window.harness?.client.game.modules.get("modular-av")
            ?.api as ModularAV;
          const doc = api.windows[which].current?.document;
          const tile = doc?.querySelector(".mav-dock-tile");
          return tile && doc
            ? {
                themed:
                  doc.documentElement.classList.contains("mav-theme-vines"),
                background: getComputedStyle(tile).backgroundColor,
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, background: VINE_TILE });
  });

test("the docked grid settles with frames that reach past the tiles", async ({
  page,
}) => {
  await page.goto(
    "/?module=dock,dock-vines&service=mock&sample=1&players=p1,p2&theme=vines",
  );
  await expect(page.locator(".mav-dock-tile")).toHaveCount(3, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);

  // Frames make the list's height follow its tiles: no flipping between
  // two widths, frame after frame.
  const seen = await page.evaluate(async () => {
    const list = document.querySelector<HTMLElement>(".mav-dock-tiles");
    const widths = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      widths.add(list?.style.getPropertyValue("--mav-dock-tile-width") ?? "");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return [...widths];
  });

  expect(seen).toHaveLength(1);
});
