// The strongbox theme: the theme contract in each layout, the windows and
// their locks, what a window shows of its player, and what the dock does
// with a theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";
import {
  boxOf,
  deafen,
  frameOf,
  leave,
  lockOf,
  MODULES,
  mute,
  open,
  place,
  poorLink,
  scatter,
  speak,
  stateOf,
  style,
  styleOf,
  tileOf,
} from "./page.ts";

themeContract({
  modules: MODULES,
  theme: "strongbox",
  layouts: [
    "Docked on the left",
    "Docked at the top",
    "Floating",
    "Scattered over the screen",
  ],
});

test.use({ viewport: { width: 1280, height: 900 } });

const CLEAR = "rgba(0, 0, 0, 0)";

const columnsOf = (page: Page): Promise<string> =>
  page
    .locator(".mav-dock-tiles")
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--mav-dock-columns").trim(),
    );

/** Every tile's lock and its place in the layout (offsets: a tile may be turned). */
async function laidLocks(
  page: Page,
): Promise<{ lock: string; x: number; y: number; w: number; h: number }[]> {
  const tiles = page.locator(".mav-dock-tile");
  const found = [];
  for (let i = 0; i < (await tiles.count()); i += 1) {
    const tile = tiles.nth(i);
    const at = await tile.evaluate((el: HTMLElement) => ({
      x: el.offsetLeft,
      y: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
    }));
    found.push({ lock: await lockOf(tile), ...at });
  }
  return found;
}

/** Pairs of tiles side by side or one over the other with nothing between, as laid out. */
function neighbours(
  laid: readonly { x: number; y: number; w: number; h: number }[],
): [number, number][] {
  const pairs: [number, number][] = [];
  const overlap = (a0: number, a1: number, b0: number, b1: number): boolean =>
    Math.min(a1, b1) - Math.max(a0, b0) > 4;
  laid.forEach((a, i) => {
    laid.forEach((b, j) => {
      if (j <= i) return;
      const beside =
        overlap(a.y, a.y + a.h, b.y, b.y + b.h) &&
        Math.abs(Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)) < 60;
      const above =
        overlap(a.x, a.x + a.w, b.x, b.x + b.w) &&
        Math.abs(Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)) < 80;
      if (beside || above) pairs.push([i, j]);
    });
  });
  return pairs;
}

const expectNoMatchingNeighbours = async (page: Page): Promise<void> => {
  const laid = await laidLocks(page);
  const pairs = neighbours(laid);

  expect(pairs.length).toBeGreaterThan(laid.length - 2);
  for (const [i, j] of pairs)
    expect(laid[i]?.lock, `tiles ${String(i)} and ${String(j)}`).not.toBe(
      laid[j]?.lock,
    );
};

for (const layout of ["in a grid", "scattered"] as const)
  test(`each camera is a window bound in iron with a lock over it, and the camera's own frame is gone, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const frame = await styleOf(frameOf(tile), [
      "background-image",
      "background-size",
      "pointer-events",
    ]);

    expect(frame["background-image"]).toMatch(
      /art\/frame-(shield|round|slide)-rest\.webp/,
    );
    expect(frame["background-size"]).toContain("100% 100%");
    expect(frame["pointer-events"]).toBe("none");
    await expect(tile).toHaveCSS("border-top-color", CLEAR);
    await expect(tile).toHaveCSS("background-color", CLEAR);
    await expect(tile).toHaveCSS("box-shadow", "none");
    await expect(tile).toHaveCSS("outline-color", CLEAR);
  });

test("in one column the three locks take turns: a shield, a round rose, a lock case with a slide", async ({
  page,
}) => {
  await open(page, 2);

  expect(
    await Promise.all(
      ["gm1", "p1", "p2"].map((id) => lockOf(tileOf(page, id))),
    ),
  ).toEqual(["shield", "round", "slide"]);
});

test("two to a row, no window has the lock of its neighbour beside it or above it", async ({
  page,
}) => {
  await open(page, 8);
  await expect.poll(() => columnsOf(page)).toBe("2");

  await expectNoMatchingNeighbours(page);
});

test("three to a row across the top, each row starts one lock on, so no window matches the one above it", async ({
  page,
}) => {
  await open(page, 5);
  await place(page, /^Docked at the top/);
  await expect.poll(() => columnsOf(page)).toBe("3");

  await expectNoMatchingNeighbours(page);
});

test("with one camera large, the turns skip it: no thumbnail matches its neighbours, nor the large window the ones under it", async ({
  page,
}) => {
  await open(page, 8);
  await page.locator(".mav-dock-layout").click();
  await expect(page.locator(".mav-dock-tiles")).toHaveAttribute(
    "data-tile-layout",
    "focus",
  );
  await expect.poll(() => columnsOf(page)).toBe("2");

  await expectNoMatchingNeighbours(page);
});

test("nine cameras stay two to a row in a dock 300 pixels wide", async ({
  page,
}) => {
  await open(page, 8);
  const tiles = page.locator(".mav-dock-tile");
  await expect
    .poll(async () => (await boxOf(tiles.nth(1))).y)
    .toBeCloseTo((await boxOf(tiles.nth(0))).y, 0);
  const [first, second] = [
    await boxOf(tiles.nth(0)),
    await boxOf(tiles.nth(1)),
  ];

  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(first.width).toBeGreaterThanOrEqual(120);
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`a voice lights the lamp inside the box, seen through the lock, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    expect(await stateOf(tile)).toBe("rest");

    await speak(page, "p1");
    await expect(tile).toHaveAttribute("data-speaking", "");

    await expect.poll(() => stateOf(tile)).toBe("speak");
    expect(await lockOf(tile)).toBe("round");
    // Nothing is blended against the camera's picture.
    for (const pseudo of [null, "::before", "::after"] as const)
      expect(await style(frameOf(tile), "mix-blend-mode", pseudo)).toBe(
        "normal",
      );
  });

test("on a poor link the lamp gutters: the lit picture over the dark one, dimmer, and still under reduced motion", async ({
  page,
}) => {
  await open(page, 1);
  const tile = tileOf(page, "p1");
  const lamp = (): Promise<Record<string, string>> =>
    styleOf(
      frameOf(tile),
      ["background-image", "opacity", "animation-name"],
      "::before",
    );
  await speak(page, "p1");
  await expect.poll(() => stateOf(tile)).toBe("speak");
  expect((await lamp())["background-image"]).toBe("none");

  await poorLink(page, "p1");
  await expect(tile).toHaveAttribute("data-quality", "poor");

  await expect.poll(() => stateOf(tile)).toBe("rest");
  const lit = await lamp();
  expect(lit["background-image"]).toContain("art/frame-round-speak.webp");
  expect(Number(lit.opacity)).toBeLessThan(1);
  // The page asks for reduced motion (open): the flame holds still.
  expect(lit["animation-name"]).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(async () => (await lamp())["animation-name"])
    .toBe("sb-gutter");
});

test("a muted window shows its muted picture (shutter, hasp, padlock), a deafened one its rag picture, and muted wins over deafened", async ({
  page,
}) => {
  await open(page, 2);
  const [deaf, both] = [tileOf(page, "p1"), tileOf(page, "p2")];

  await deafen(page, "p1");
  await deafen(page, "p2");
  await mute(page, "p2");
  await expect(deaf).toHaveAttribute("data-deafened", "");
  await expect(both).toHaveAttribute("data-muted", "");

  await expect.poll(() => stateOf(deaf)).toBe("deaf");
  await expect.poll(() => stateOf(both)).toBe("muted");
});

test("muted and speaking at once, the shutter stays down", async ({ page }) => {
  await open(page, 1);
  const tile = tileOf(page, "p1");

  await mute(page, "p1");
  await speak(page, "p1");
  await expect(tile).toHaveAttribute("data-muted", "");

  await expect.poll(() => stateOf(tile)).toBe("muted");
});

test("out of the call the lock is forced, the window dark over the lining, the name in duller paint, nothing faded", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");

  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  await expect.poll(() => stateOf(own)).toBe("out");
  await expect(own).toHaveCSS("opacity", "1");
  const media = await style(
    own.locator(".mav-dock-tile-media"),
    "background-image",
  );
  expect(media).toContain("art/lining.webp");
  expect(media).toContain("linear-gradient");
  await expect(own.locator(".mav-dock-tile-name")).toHaveCSS(
    "color",
    "rgb(194, 182, 162)",
  );
  // No level shows on a window out of the call.
  expect(await style(frameOf(own), "background-image")).not.toContain(
    "art/level.webp",
  );
});

test("a camera that is off shows the box's padded lining", async ({ page }) => {
  await open(page, 1);
  await page.evaluate(() =>
    window.harness?.ui?.players.p1?.commands.setVideoEnabled(false),
  );
  const tile = tileOf(page, "p1");
  await expect(tile).toHaveAttribute("data-video", "off");

  expect(
    await style(tile.locator(".mav-dock-tile-media"), "background-image"),
  ).toContain("art/lining.webp");
  expect(await stateOf(tile)).toBe("rest");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`the name is stencilled on the boards under the window, in the middle, worn by the grain, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const name = tile.locator(".mav-dock-tile-name");
    const [picture, label, frame] = [
      await boxOf(tile),
      await boxOf(name),
      await boxOf(frameOf(tile)),
    ];

    expect(label.y).toBeGreaterThan(picture.y + picture.height);
    expect(label.y + label.height).toBeLessThanOrEqual(
      frame.y + frame.height + 1,
    );
    expect(Math.abs(label.middle - picture.middle)).toBeLessThan(2);
    await expect(name).toHaveCSS("background-color", CLEAR);
    await expect(name).toHaveCSS("text-transform", "uppercase");
    expect(await style(name, "mask-image")).toContain("art/wear.webp");
  });

test("your own level is the lamp through a slot in your window's bottom strap; no other window has it", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  const meter = own.locator(".mav-meter");

  await expect(meter).toHaveCount(1);
  await expect(tileOf(page, "p1").locator(".mav-meter")).toHaveCount(0);
  expect(await style(frameOf(own), "background-image")).toContain(
    "art/level.webp",
  );
  expect(
    await style(frameOf(tileOf(page, "p1")), "background-image"),
  ).not.toContain("art/level.webp");
  expect(await style(meter, "mask-image")).toContain("art/level-mask.webp");
  expect(
    await style(meter.locator(".mav-meter-fill"), "background-image"),
  ).toContain("art/level-fill.webp");
  const [slot, tile] = [await boxOf(meter), await boxOf(own)];
  // Under the picture, across its middle: 31.2% in from each side.
  expect(slot.y).toBeGreaterThan(tile.y + tile.height * 0.97);
  expect((slot.x - tile.x) / tile.width).toBeCloseTo(0.312, 2);
  expect(slot.width / tile.width).toBeCloseTo(0.376, 2);
});

test("states stand on the picture's upper left and another module's badge on its upper right, on iron plates", async ({
  page,
}) => {
  await open(page, 1, "strongbox", "&sample=1");
  await page.evaluate(() => {
    void window.harness?.ui?.players.p1?.commands.setMuted(true);
  });
  const tile = tileOf(page, "p1");
  const icon = tile.locator(".mav-dock-tile-indicators .mav-indicator").first();
  await expect(icon).toBeVisible();
  const [picture, state] = [await boxOf(tile), await boxOf(icon)];

  expect(state.x - picture.x).toBeLessThan(picture.width * 0.15);
  expect(state.y - picture.y).toBeLessThan(picture.height * 0.2);
  expect(state.y).toBeGreaterThanOrEqual(picture.y);
  expect(await style(icon, "border-image-source")).toContain("art/button.webp");
});

test("the menu button takes the badges' corner, and the badges step down under it", async ({
  page,
}) => {
  await open(page, 1, "strongbox", "&sample=1");
  await page.evaluate(() => window.harness?.sample?.setIndicated(["p1"]));
  const tile = tileOf(page, "p1");
  const badges = tile.locator(".mav-dock-tile-badges");
  await expect(badges.locator(".mav-indicator").first()).toBeVisible();
  const before = await boxOf(badges);

  await tile.hover();
  const menu = await boxOf(tile.locator(".mav-dock-tile-menu"));

  await expect
    .poll(async () => (await boxOf(badges)).y)
    .toBeGreaterThan(before.y + 20);
  expect((await boxOf(badges)).y).toBeGreaterThanOrEqual(
    menu.y + menu.height - 1,
  );
});

test("loads only its own stylesheet, and only while chosen", async ({
  page,
}) => {
  await open(page, 1);
  const windowArt = (): Promise<string> =>
    style(frameOf(tileOf(page, "p1")), "background-image");

  await expect(page.locator("html")).toHaveClass(/mav-theme-strongbox/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-strongbox/strongbox.css",
  );
  expect(await windowArt()).toContain("art/frame-");

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(windowArt).not.toContain("art/frame-");
});

test("is offered without it: the dock's own look stays", async ({ page }) => {
  await open(page, 1, "");

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await page.locator(".mav-dock-settings").click();
  await page.getByRole("tab", { name: "Appearance" }).click();
  const choice = page.getByLabel("Theme for everyone", { exact: true });
  await expect(choice).toHaveValue("default");
  await expect(choice.locator("option")).toHaveText([
    "Modular A/V's own look",
    "Strongbox (a rogue's locked box)",
  ]);
});

test("suggests a docked layout, where the dock is the box, leaving the dock where it is", async ({
  page,
}) => {
  await open(page, 1);
  await place(page, /^Floating/);
  await page.locator(".mav-dock-placement").click();

  await expect(
    page.getByRole("menuitemradio", {
      name: "Docked on the left (the theme's suggestion)",
    }),
  ).toBeVisible();
  await expect(page.locator(".mav-dock")).toHaveAttribute(
    "data-placement",
    "floating",
  );
});

for (const { kind, choice } of [
  { kind: "popup", choice: "In a window of its own" },
  { kind: "pip", choice: "In a window always on top" },
] as const)
  test(`follows the dock into its ${kind} window`, async ({ page }) => {
    await open(page, 1);

    await place(page, new RegExp(`^${choice}`));

    await expect
      .poll(() =>
        page.evaluate((which) => {
          const api = window.harness?.client.game.modules.get("modular-av")
            ?.api as ModularAV;
          const doc = api.windows[which].current?.document;
          const frame = doc?.querySelector(".mav-dock-tile-frame");
          return frame && doc
            ? {
                themed: doc.documentElement.classList.contains(
                  "mav-theme-strongbox",
                ),
                window:
                  getComputedStyle(frame).backgroundImage.includes(
                    "art/frame-",
                  ),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, window: true });
  });

test("the docked grid settles with windows that reach past the tiles", async ({
  page,
}) => {
  await page.goto(
    `/?module=${MODULES}&service=mock&sample=1&players=p1,p2&theme=strongbox`,
  );
  await expect(page.locator(".mav-dock-tile")).toHaveCount(3, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);

  const seen = await page.evaluate(async () => {
    const tiles = document.querySelector<HTMLElement>(".mav-dock-tiles");
    const widths = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      widths.add(tiles?.style.getPropertyValue("--mav-dock-tile-width") ?? "");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return [...widths];
  });

  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatch(/^\d+(\.\d+)?px$/);
});
