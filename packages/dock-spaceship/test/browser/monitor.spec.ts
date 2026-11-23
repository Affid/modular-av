// The spaceship theme's monitors: the theme contract in each layout, each
// camera in a CRT monitor, what a monitor shows of its player, the name on
// the readout, your own level, the states' and badges' keys, and what the
// dock does with a theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, test } from "@playwright/test";
import {
  boxOf,
  button,
  deafen,
  frameOf,
  kindOf,
  leave,
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
  theme: "spaceship",
  layouts: [
    "Docked on the left",
    "Docked at the top",
    "Floating",
    "Scattered over the screen",
  ],
});

test.use({ viewport: { width: 1280, height: 900 } });

const CLEAR = "rgba(0, 0, 0, 0)";
/** The readout's lit segments: dim at rest, full while the voice goes out; a grey trace out of the call. */
const SEGMENT = {
  rest: "rgb(79, 180, 106)",
  lit: "rgb(180, 255, 198)",
  out: "rgb(125, 142, 131)",
};
/** The readout's window in a tile 1000 units wide (measures.json readout.window). */
const WINDOW = { left: 110, top: 614, right: 890, bottom: 702 };

const nameOf = (tile: Locator): Locator => tile.locator(".mav-dock-tile-name");

/** The snow's shortest flicker cycle, in seconds: one flash each, so at most one and a quarter a second. */
const MIN_SNOW_CYCLE = 0.8;
const barOf = (tile: Locator): Locator => tile.locator(".mav-dock-tile-bar");

for (const layout of ["in a grid", "scattered"] as const)
  test(`each camera sits in a monitor, and the camera's own frame is gone, ${layout}`, async ({
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

    expect(frame["background-image"]).toContain("art/monitor-rest.webp");
    expect(frame["background-size"]).toContain("100% 100%");
    expect(frame["pointer-events"]).toBe("none");
    await expect(tile).toHaveCSS("border-top-color", CLEAR);
    await expect(tile).toHaveCSS("background-color", CLEAR);
    await expect(tile).toHaveCSS("box-shadow", "none");
    await expect(tile).toHaveCSS("outline-color", CLEAR);
  });

test("a camera blocked by the GM keeps its picture the tile's size, inside the case: no border shrinks it", async ({
  page,
}) => {
  await open(page, 1);
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")
      ?.api as ModularAV;
    await api.commands.setBroadcastPermissions("p1", {
      audio: false,
      video: false,
    });
  });
  const tile = tileOf(page, "p1");
  await expect(tile).toHaveAttribute("data-blocked-audio", "");

  await expect(tile).toHaveCSS("border-top-width", "0px");
  const [box, media] = [
    await boxOf(tile),
    await boxOf(tile.locator(".mav-dock-tile-media")),
  ];
  expect(media.width).toBe(box.width);
  expect(media.height).toBe(box.height);
});

test("your own monitor has the level's window in its side, the others' a plain side", async ({
  page,
}) => {
  await open(page, 1);

  expect(await kindOf(tileOf(page, "gm1"))).toBe("own");
  expect(await kindOf(tileOf(page, "p1"))).toBe("monitor");
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
  expect(first.width).toBeGreaterThanOrEqual(125);
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`a voice lights the TX lamp and drives the readout full, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    expect(await stateOf(tile)).toBe("rest");
    await expect(nameOf(tile)).toHaveCSS("color", SEGMENT.rest);

    await speak(page, "p1");
    await expect(tile).toHaveAttribute("data-speaking", "");

    await expect.poll(() => stateOf(tile)).toBe("speak");
    await expect(nameOf(tile)).toHaveCSS("color", SEGMENT.lit);
    expect(await style(nameOf(tile), "text-shadow")).not.toBe("none");
    expect(await style(barOf(tile), "background-image")).toContain(
      "art/readout-speak.webp",
    );
    // Nothing is blended against the camera's picture.
    for (const pseudo of [null, "::before", "::after"] as const)
      expect(await style(frameOf(tile), "mix-blend-mode", pseudo)).toBe(
        "normal",
      );
  });

test("muted, tape crosses the grille; deafened, the headset hangs on the case; both, both", async ({
  page,
}) => {
  await open(page, 3);
  const [muted, deaf, both] = [
    tileOf(page, "p1"),
    tileOf(page, "p2"),
    tileOf(page, "p3"),
  ];

  await mute(page, "p1");
  await deafen(page, "p2");
  await deafen(page, "p3");
  await mute(page, "p3");
  await expect(both).toHaveAttribute("data-muted", "");

  await expect.poll(() => stateOf(muted)).toBe("muted");
  await expect.poll(() => stateOf(deaf)).toBe("deaf");
  await expect.poll(() => stateOf(both)).toBe("mdeaf");
});

test("muted and speaking at once, no voice goes out: the lamp stays dark and the readout dim", async ({
  page,
}) => {
  await open(page, 1);
  const tile = tileOf(page, "p1");

  await mute(page, "p1");
  await speak(page, "p1");
  await expect(tile).toHaveAttribute("data-muted", "");

  await expect.poll(() => stateOf(tile)).toBe("muted");
  await expect(nameOf(tile)).toHaveCSS("color", SEGMENT.rest);
  expect(await style(barOf(tile), "background-image")).toContain(
    "art/readout-rest.webp",
  );
});

test("your own monitor shows your states in its own pictures", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");

  await button(page, "deafen").click();
  await expect(own).toHaveAttribute("data-deafened", "");
  await expect.poll(() => stateOf(own)).toBe("deaf");
  expect(await kindOf(own)).toBe("own");
});

test("the scan lines lie only in the tube's margin, and never over a hung headset", async ({
  page,
}) => {
  await open(page, 1);
  const lines = (tile: Locator): Promise<Record<string, string>> =>
    styleOf(frameOf(tile), ["background-image", "mask-image"], "::before");
  const [own, other] = [tileOf(page, "gm1"), tileOf(page, "p1")];

  const at = await lines(other);
  expect(at["background-image"]).toContain("repeating-linear-gradient");
  expect(at["mask-image"]).toContain("art/scan.webp");

  await deafen(page, "p1");
  await button(page, "deafen").click();
  await expect
    .poll(async () => (await lines(other))["mask-image"])
    .toContain("art/scan-deaf.webp");
  expect((await lines(own))["mask-image"]).toContain("art/scan-deaf-own.webp");
});

test("on a weak link the tube's margin snows and flickers, holds still under reduced motion, and is masked round a hung headset", async ({
  page,
}) => {
  await open(page, 1);
  const tile = tileOf(page, "p1");
  const snow = (): Promise<Record<string, string>> =>
    styleOf(
      frameOf(tile),
      ["background-image", "mask-image", "animation-name"],
      "::before",
    );

  await poorLink(page, "p1");
  await expect(tile).toHaveAttribute("data-quality", "poor");

  const seen = await snow();
  expect(seen["background-image"]).toContain("art/snow.webp");
  expect(seen["mask-image"]).toBe("none");
  // The page asks for reduced motion (open): the snow holds still.
  expect(seen["animation-name"]).toBe("none");

  await deafen(page, "p1");
  await expect
    .poll(async () => (await snow())["mask-image"])
    .toContain("art/snow-deaf.webp");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(async () => (await snow())["animation-name"])
    .toBe("ship-snow");
  // One flash a cycle: well under three a second (WCAG 2.3.1), even when every monitor snows at once.
  const cycle = await style(frameOf(tile), "animation-duration", "::before");
  expect(Number.parseFloat(cycle)).toBeGreaterThanOrEqual(MIN_SNOW_CYCLE);
});

test("out of the call the set is off: solid, no scan lines, a dead tube, the name a grey trace", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");

  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  await expect(own).toHaveCSS("opacity", "1");
  expect(await style(frameOf(own), "display", "::before")).toBe("none");
  expect(
    await style(own.locator(".mav-dock-tile-media"), "background-image"),
  ).toContain("radial-gradient");
  await expect(nameOf(own)).toHaveCSS("color", SEGMENT.out);
  // The never-lit segments behind the glass go dark with the set.
  expect(
    await style(own.locator(".mav-dock-tile-bar"), "visibility", "::before"),
  ).toBe("hidden");
});

test("a camera that is off shows the tube lit with no picture: a dim raster", async ({
  page,
}) => {
  await open(page, 1);
  await page.evaluate(() =>
    window.harness?.ui?.players.p1?.commands.setVideoEnabled(false),
  );
  const tile = tileOf(page, "p1");
  await expect(tile).toHaveAttribute("data-video", "off");

  const media = await style(
    tile.locator(".mav-dock-tile-media"),
    "background-image",
  );
  expect(media).toContain("repeating-linear-gradient");
  expect(media).toContain("radial-gradient");
  expect(await stateOf(tile)).toBe("rest");
});

test("the player's colour is a strip of tape on the case's corner, the colour through the tape's own shading", async ({
  page,
}) => {
  await open(page, 1);
  const tape = await styleOf(
    frameOf(tileOf(page, "p1")),
    ["background-image", "background-blend-mode", "mask-image"],
    "::after",
  );

  expect(tape["background-image"]).toContain("art/colour-tape.webp");
  expect(tape["background-blend-mode"]).toContain("multiply");
  expect(tape["mask-image"]).toContain("art/colour-tape.webp");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`the name is lit on the readout in the chin, its bar exactly on the readout's window, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const [picture, bar] = [await boxOf(tile), await boxOf(barOf(tile))];
    const unit = picture.width / 1000;

    expect(bar.x - picture.x).toBeCloseTo(WINDOW.left * unit, 0);
    expect(bar.y - picture.y).toBeCloseTo(WINDOW.top * unit, 0);
    expect(bar.width).toBeCloseTo((WINDOW.right - WINDOW.left) * unit, 0);
    expect(bar.height).toBeCloseTo((WINDOW.bottom - WINDOW.top) * unit, 0);
    expect(bar.y).toBeGreaterThan(picture.y + picture.height);
    const name = nameOf(tile);
    expect(await style(name, "font-family")).toContain("DSEG14 Classic");
    await expect(name).toHaveCSS("text-transform", "uppercase");
    // The never-lit segments, faint behind the glass.
    expect(await style(barOf(tile), "content", "::before")).toMatch(/^"~+"$/);
  });

test("a long name slides along the window until its end shows, and back; under reduced motion it stops, cut with an ellipsis", async ({
  page,
}) => {
  await open(page, 1);
  const name = nameOf(tileOf(page, "p1"));
  await name.evaluate((el) => {
    el.textContent = "Quartermaster of the long night watch";
  });
  const window = await boxOf(barOf(tileOf(page, "p1")));

  // Held still: cut at the window's end, with an ellipsis.
  expect(
    await styleOf(name, ["animation-name", "text-overflow", "overflow-x"]),
  ).toEqual({
    "animation-name": "none",
    "text-overflow": "ellipsis",
    "overflow-x": "hidden",
  });
  expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );

  // Free to move: at the turn of its slide the name's end sits at the window's end.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => style(name, "animation-name")).toBe("ship-slide");
  const moved = await name.evaluate((el) => {
    const slide = el.getAnimations()[0];
    if (!slide) return null;
    slide.pause();
    slide.currentTime = 0;
    const start = el.getBoundingClientRect().x;
    slide.currentTime = 8000;
    return el.getBoundingClientRect().x - start;
  });
  const [text, pad] = [await boxOf(name), window.width * (15 / 780)];
  expect(moved).toBeLessThan(-20);
  expect(text.x + text.width).toBeCloseTo(window.x + window.width - pad, 0);
});

test("your own level is a column of green segments in your monitor's side window; no other monitor has it", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  const meter = own.locator(".mav-meter");

  await expect(meter).toHaveCount(1);
  await expect(tileOf(page, "p1").locator(".mav-meter")).toHaveCount(0);
  expect(await style(meter, "rotate")).toBe("-90deg");
  expect(await style(meter, "mask-image")).toContain(
    "repeating-linear-gradient",
  );
  const [column, tile] = [await boxOf(meter), await boxOf(own)];
  // Right of the picture, inside the case's side (the reach is 6.5% of the tile's width).
  expect(column.x).toBeGreaterThan(tile.x + tile.width);
  expect(column.x + column.width).toBeLessThan(tile.x + tile.width * 1.065);
  expect(column.height).toBeGreaterThan(tile.height * 0.8);
});

test("states stand on the picture's upper left and another module's badge on its upper right, as rubber keys", async ({
  page,
}) => {
  await open(page, 1, "spaceship", "&sample=1");
  await page.evaluate(() => window.harness?.sample?.setIndicated(["p1"]));
  await mute(page, "p1");
  const tile = tileOf(page, "p1");
  const icon = tile.locator(".mav-dock-tile-indicators .mav-indicator").first();
  const badge = tile.locator(".mav-dock-tile-badges .mav-indicator").first();
  await expect(icon).toBeVisible();
  await expect(badge).toBeVisible();
  const [picture, state, other] = [
    await boxOf(tile),
    await boxOf(icon),
    await boxOf(badge),
  ];

  expect(state.x - picture.x).toBeLessThan(picture.width * 0.15);
  expect(state.y - picture.y).toBeLessThan(picture.height * 0.2);
  expect(picture.x + picture.width - (other.x + other.width)).toBeLessThan(
    picture.width * 0.15,
  );
  expect(await style(badge, "border-image-source")).toContain(
    "art/key-rest.webp",
  );
  // On whole pixels, an even size: the key's middle is a whole pixel.
  for (const box of [state, other]) {
    expect(box.x % 1).toBe(picture.x % 1);
    expect(box.height % 2).toBe(0);
  }
});

test("the menu key takes the badges' corner, and the badges step aside left of it", async ({
  page,
}) => {
  await open(page, 1, "spaceship", "&sample=1");
  await page.evaluate(() => window.harness?.sample?.setIndicated(["p1"]));
  const tile = tileOf(page, "p1");
  const badges = tile.locator(".mav-dock-tile-badges");
  await expect(badges.locator(".mav-indicator").first()).toBeVisible();
  const before = await boxOf(badges);

  await tile.hover();
  const menu = tile.locator(".mav-dock-tile-menu");
  expect(await style(menu, "border-image-source")).toContain(
    "art/key-rest.webp",
  );
  const key = await boxOf(menu);

  await expect
    .poll(async () => (await boxOf(badges)).x)
    .toBeLessThan(before.x - 20);
  const stepped = await boxOf(badges);
  expect(stepped.x + stepped.width).toBeLessThanOrEqual(key.x + 1);
  // Under the pointer the key itself lights up.
  await menu.hover();
  expect(await style(menu, "border-image-source")).toContain(
    "art/key-rest-hover.webp",
  );
});

test("loads only its own stylesheet, and only while chosen", async ({
  page,
}) => {
  await open(page, 1);
  const monitorArt = (): Promise<string> =>
    style(frameOf(tileOf(page, "p1")), "background-image");

  await expect(page.locator("html")).toHaveClass(/mav-theme-spaceship/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-spaceship/spaceship.css",
  );
  expect(await monitorArt()).toContain("art/monitor-");

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(monitorArt).not.toContain("art/monitor-");
});

test("serves the readout's font beside its stylesheet", async ({ page }) => {
  await open(page, 1);

  const response = await page.request.get(
    "/modules/modular-av-dock-spaceship/fonts/DSEG14Classic-Regular.woff2",
  );
  expect(response.ok()).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => document.fonts.check('12px "DSEG14 Classic"')),
    )
    .toBe(true);
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
    "Spaceship (a cargo hauler's hold)",
  ]);
});

test("suggests a docked layout, where the dock is the bulkhead, leaving the dock where it is", async ({
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
                  "mav-theme-spaceship",
                ),
                monitor: /art\/(monitor|own)-/.test(
                  getComputedStyle(frame).backgroundImage,
                ),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, monitor: true });
  });
