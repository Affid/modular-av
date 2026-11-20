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

/** What shows the theme is on: the ground behind a picture is its frame's shape. */
const GROUND = /frames\/shape-\w+\.svg/;
const groundOf = (media: Locator): Promise<string> =>
  media.evaluate((el) => getComputedStyle(el).backgroundImage);

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
  property: "backgroundImage" | "boxShadow" | "maskImage" | "opacity",
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

async function scatter(page: Page): Promise<void> {
  await page.locator(".mav-dock-placement").click();
  await page
    .getByRole("menuitemradio", { name: /Scattered over the screen/ })
    .click();
  await expect(
    page.locator(".mav-dock-tile[data-anchor]").first(),
  ).toBeVisible();
}

/** The corner a tile's pictures are for: its anchor's when scattered, its turn's in a grid. */
const cornerOf = async (tile: Locator, turn: number): Promise<string> =>
  CORNER_OF[(await tile.getAttribute("data-anchor")) ?? ""] ??
  CORNERS[turn % CORNERS.length] ??
  "tl";

test("scattered: each tile has a frame of its own shape, for the corner it sits in", async ({
  page,
}) => {
  const loaded: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/modular-av-dock-vines/frames/"))
      loaded.push(response.status());
  });
  await open(page, "vines", ["p1", "p2", "p3"]);
  await scatter(page);

  const seen = new Set<string>();
  for (const tile of await page.locator(".mav-dock-tile").all()) {
    const corner = await cornerOf(tile, 0);
    seen.add(corner);
    expect(await frameStyle(tile, "backgroundImage")).toMatch(
      new RegExp(
        `frames/vines-${corner}-green\\.svg.*frames/frame-${corner}\\.svg`,
      ),
    );
    // The picture is cut to that frame's shape, over ground of the same shape.
    const media = tile.locator(".mav-dock-tile-media");
    expect(
      await media
        .locator(".mav-dock-tile-video")
        .evaluate((video) => getComputedStyle(video).maskImage),
    ).toContain(`frames/shape-${corner}.svg`);
    expect(
      await media.evaluate((el) => getComputedStyle(el).backgroundImage),
    ).toContain(`frames/shape-${corner}.svg`);
    await expect(tile).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  expect(seen.size).toBeGreaterThan(1);
  expect(loaded.length).toBeGreaterThan(8);
  expect(new Set(loaded)).toEqual(new Set([200]));
});

test("in a grid, each tile hangs in a frame of its own, tied to its lianas", async ({
  page,
}) => {
  await open(page, "vines", ["p1", "p2", "p3"]);
  const tiles = await page.locator(".mav-dock-tile").all();

  for (const [turn, tile] of tiles.entries()) {
    const corner = await cornerOf(tile, turn);
    // The withy over the vines over the branches, as when scattered.
    expect(await frameStyle(tile, "backgroundImage")).toMatch(
      new RegExp(
        `frames/knots-${corner}\\.svg.*frames/vines-${corner}-green\\.svg.*frames/frame-${corner}\\.svg`,
      ),
    );
    expect(
      await tile
        .locator(".mav-dock-tile-video")
        .evaluate((video) => getComputedStyle(video).maskImage),
    ).toContain(`frames/shape-${corner}.svg`);
    // Its lianas, behind it and everything else.
    const lianas = await tile.evaluate((el) => {
      const style = getComputedStyle(el, "::before");
      return { image: style.backgroundImage, z: style.zIndex };
    });
    expect(lianas.image).toContain(`frames/hang-${corner}.svg`);
    expect(lianas.z).toBe("-1");
  }
  // Tiles are apart by the room the theme registers: 5.8% of a tile's
  // width over a tile, 12.8% under it, where its name hangs.
  const boxes = await Promise.all(tiles.map((tile) => tile.boundingBox()));
  const [first, second] = boxes;
  if (!first || !second) throw new Error("No tiles");
  const apart =
    second.y > first.y + 1
      ? (second.y - (first.y + first.height)) / first.width
      : (second.x - (first.x + first.width)) / first.width;
  expect(apart).toBeGreaterThan(0.1);
  expect(apart).toBeLessThan(0.2);
  // The frame layer keeps the art's whole reach: neighbours' ivy may overlap.
  const layer = await tiles[0]?.locator(".mav-dock-tile-frame").boundingBox();
  expect(((layer?.width ?? 0) - first.width) / 2 / first.width).toBeCloseTo(
    0.11,
    2,
  );
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`turns a muted player's leaves to autumn, ${layout}`, async ({
    page,
  }) => {
    await open(page, "vines");
    if (layout === "scattered") await scatter(page);
    const [muted, other] = [tileOf(page, "p1"), tileOf(page, "gm1")];

    await page.evaluate(() =>
      window.harness?.ui?.players.p1?.commands.setMuted(true),
    );
    await expect(muted).toHaveAttribute("data-muted", "");
    // p1 is the second tile: in a grid its vines are the top right's.
    const corner = await cornerOf(muted, 1);

    await expect.poll(() => frameStyle(muted, "opacity", "::before")).toBe("1");
    expect(await frameStyle(muted, "backgroundImage", "::before")).toContain(
      `frames/leaves-${corner}-autumn.svg`,
    );
    expect(await frameStyle(other, "opacity", "::before")).toBe("0");
  });

for (const layout of ["in a grid", "scattered"] as const)
  test(`lights the picture's rim while a player speaks, in place of the dock's ring, ${layout}`, async ({
    page,
  }) => {
    await open(page, "vines");
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const corner = await cornerOf(tile, 1);
    expect(await frameStyle(tile, "opacity", "::after")).toBe("0");

    await page.evaluate(() => window.harness?.ui?.hub.setSpeaking("p1", true));
    await expect(tile).toHaveAttribute("data-speaking", "");

    // Its frame's own picture of light, which stops at the branches.
    await expect.poll(() => frameStyle(tile, "opacity", "::after")).toBe("1");
    expect(await frameStyle(tile, "maskImage", "::after")).toContain(
      `frames/light-${corner}.svg`,
    );
    // The ring is kept, clear: forced colours draw it, where a light is lost.
    await expect(tile).toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
    await expect(tile).not.toHaveCSS("outline-style", "none");
  });

test("shows bare stems while the player is out of the call", async ({
  page,
}) => {
  await open(page, "vines");
  const own = tileOf(page, "gm1");

  await page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")
      ?.api as ModularAV;
    return api.commands.leave();
  });
  await expect(own).not.toHaveAttribute("data-connected");

  expect(await frameStyle(own, "backgroundImage")).toMatch(
    /frames\/knots-tl\.svg.*frames\/vines-tl-bare\.svg.*frames\/frame-tl\.svg/,
  );

  await scatter(page);
  const corner = await cornerOf(own, 0);

  expect(await frameStyle(own, "backgroundImage")).toMatch(
    new RegExp(
      `frames/vines-${corner}-bare\\.svg.*frames/frame-${corner}\\.svg`,
    ),
  );
  expect(await frameStyle(own, "backgroundImage")).not.toContain("knots");
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
  const media = page.locator(".mav-dock-tile-media").first();
  expect(await groundOf(media)).toMatch(GROUND);

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(() => groundOf(media)).toBe("none");
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
    "Vines (a druid's grove)",
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
          const tile = doc?.querySelector(".mav-dock-tile-media");
          return tile && doc
            ? {
                themed:
                  doc.documentElement.classList.contains("mav-theme-vines"),
                ground: /frames\/shape-\w+\.svg/.test(
                  getComputedStyle(tile).backgroundImage,
                ),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, ground: true });
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
