// The vines theme: the theme contract in each layout, and what the dock
// does with a theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

themeContract({
  modules: "dock,dock-vines",
  theme: "vines",
  layouts: ["Docked on the left", "Floating", "Scattered over the screen"],
});

/** The vines palette's tile background, #17110b. */
const VINE_TILE = "rgb(23, 17, 11)";

async function open(
  page: Page,
  theme: string,
  players: readonly string[] = ["p1"],
): Promise<void> {
  await page.goto(
    `/?module=dock,dock-vines&service=mock&players=${players.join(",")}&theme=${theme}`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile[data-connected]")).toHaveCount(
    players.length + 1,
    { timeout: 20_000 },
  );
}

const tileOf = (page: Page, id: string): Locator =>
  page.locator(`.mav-dock-tile[data-participant-id="${id}"]`);

/** A style of a tile's frame layer, or of one of its two painted layers. */
const frameStyle = (
  tile: Locator,
  property: "backgroundImage" | "opacity",
  layer?: "::before" | "::after",
): Promise<string> =>
  tile
    .locator(".mav-dock-tile-frame")
    .evaluate(
      (frame, [prop, pseudo]) => getComputedStyle(frame, pseudo)[prop],
      [property, layer ?? null] as const,
    );

const CORNERS = ["tl", "tr", "bl", "br"] as const;
/** Which corner a scattered tile's vines grow from, by where it sits. */
const CORNER_OF: Readonly<Record<string, string>> = {
  "top-left": "tl",
  top: "tl",
  "top-right": "tr",
  right: "tr",
  "bottom-left": "bl",
  left: "bl",
  "bottom-right": "br",
  bottom: "br",
};

test("frames each tile in woven branches, with vines from a corner of its own", async ({
  page,
}) => {
  const loaded: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/modular-av-dock-vines/frames/"))
      loaded.push(response.status());
  });
  await open(page, "vines", ["p1", "p2", "p3"]);

  const pictures = await Promise.all(
    ["gm1", "p1", "p2", "p3"].map((id) =>
      frameStyle(tileOf(page, id), "backgroundImage"),
    ),
  );

  // Docked, the tiles take the four corners in turn; the frame is under each.
  pictures.forEach((picture, i) => {
    expect(picture).toMatch(
      new RegExp(
        `frames/vines-${CORNERS[i] ?? ""}-green\\.svg.*frames/frame\\.svg`,
      ),
    );
  });
  // Each tile's summer vines and autumn leaves, and the one frame.
  await expect.poll(() => loaded.length).toBeGreaterThanOrEqual(9);
  expect(new Set(loaded)).toEqual(new Set([200]));
});

test("scattered: a tile's vines grow from the corner it sits in", async ({
  page,
}) => {
  await open(page, "vines", ["p1", "p2", "p3"]);

  await page.locator(".mav-dock-placement").click();
  await page
    .getByRole("menuitemradio", { name: /Scattered over the screen/ })
    .click();
  await expect(page.locator(".mav-dock-tile[data-anchor]")).toHaveCount(4);

  const seen = new Set<string>();
  for (const tile of await page.locator(".mav-dock-tile").all()) {
    const corner = CORNER_OF[(await tile.getAttribute("data-anchor")) ?? ""];
    expect(await frameStyle(tile, "backgroundImage")).toContain(
      `frames/vines-${corner ?? "?"}-green.svg`,
    );
    seen.add(corner ?? "?");
  }
  expect(seen.size).toBeGreaterThan(1);
});

test("turns a muted player's leaves to autumn, over the same vines", async ({
  page,
}) => {
  await open(page, "vines");
  const [muted, other] = [tileOf(page, "p1"), tileOf(page, "gm1")];
  expect(await frameStyle(muted, "opacity", "::before")).toBe("0");

  await page.evaluate(() =>
    window.harness?.ui?.players.p1?.commands.setMuted(true),
  );

  await expect(muted).toHaveAttribute("data-muted", "");
  await expect.poll(() => frameStyle(muted, "opacity", "::before")).toBe("1");
  // p1 is the second tile: its vines grow from the top right.
  expect(await frameStyle(muted, "backgroundImage", "::before")).toContain(
    "frames/leaves-tr-autumn.svg",
  );
  expect(await frameStyle(muted, "backgroundImage")).toContain(
    "frames/vines-tr-green.svg",
  );
  expect(await frameStyle(other, "opacity", "::before")).toBe("0");
});

test("glows inside the frame while a player speaks, in place of the dock's ring", async ({
  page,
}) => {
  await open(page, "vines");
  const tile = tileOf(page, "p1");
  expect(await frameStyle(tile, "opacity", "::after")).toBe("0");

  await page.evaluate(() => window.harness?.ui?.hub.setSpeaking("p1", true));

  await expect(tile).toHaveAttribute("data-speaking", "");
  await expect.poll(() => frameStyle(tile, "opacity", "::after")).toBe("1");
  // The ring is kept, clear: forced colours draw it, where a glow is lost.
  await expect(tile).toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
  await expect(tile).not.toHaveCSS("outline-style", "none");
  // The glow lies inside the video's edge, clear of the branches.
  const inset = await tile.evaluate((element) => {
    const frame = element.querySelector(".mav-dock-tile-frame");
    if (!frame) return undefined;
    const video = element.getBoundingClientRect();
    const layer = frame.getBoundingClientRect();
    const glow = getComputedStyle(frame, "::after");
    return {
      left: layer.left + parseFloat(glow.left) - video.left,
      top: layer.top + parseFloat(glow.top) - video.top,
      width: video.width,
    };
  });
  expect(inset?.left).toBeGreaterThan(0);
  expect(inset?.top).toBeGreaterThan(0);
  expect(inset?.left).toBeLessThan((inset?.width ?? 0) * 0.03);
});

test("shows bare stems while the player is out of the call", async ({
  page,
}) => {
  await open(page, "vines");
  const own = tileOf(page, "gm1");
  await page.evaluate(() =>
    window.harness?.ui?.players.p1?.commands.setMuted(true),
  );

  await page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")
      ?.api as ModularAV;
    return api.commands.leave();
  });

  await expect(own).not.toHaveAttribute("data-connected");
  expect(await frameStyle(own, "backgroundImage")).toMatch(
    /frames\/vines-tl-bare\.svg.*frames\/frame\.svg/,
  );
  expect(await frameStyle(own, "opacity", "::before")).toBe("0");
});

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
