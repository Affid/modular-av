// The scrolls theme: the theme contract in each layout, each camera's
// scroll and what it shows of its player, and what the dock does with a
// theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, test } from "@playwright/test";
import {
  boxOf,
  frameOf,
  leave,
  list,
  MODULES,
  mute,
  open,
  place,
  scatter,
  speak,
  style,
  tileOf,
} from "./page.ts";

themeContract({
  modules: MODULES,
  theme: "scrolls",
  layouts: [
    "Docked on the left",
    "Docked at the top",
    "Floating",
    "Scattered over the screen",
  ],
});

test.use({ viewport: { width: 1280, height: 900 } });

for (const layout of ["in a grid", "scattered"] as const)
  test(`each camera is a picture in a scroll: one of two sheets, written in one of four hands, ${layout}`, async ({
    page,
  }) => {
    const loaded: number[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/modular-av-dock-scrolls/art/"))
        loaded.push(response.status());
    });
    await open(page, 4);
    if (layout === "scattered") await scatter(page);
    const tiles = await page.locator(".mav-dock-tile").all();

    for (const [turn, tile] of tiles.entries()) {
      const [sheet, hand] = [(turn % 2) + 1, (turn % 4) + 1];
      // The ink over the stones' shadow over the sheet.
      expect(await style(frameOf(tile), "background-image")).toMatch(
        new RegExp(
          `art/ink-${String(hand)}\\.svg.*art/shadow-${String(sheet)}\\.webp.*art/scroll-${String(sheet)}\\.webp`,
        ),
      );
      // The tile itself shows nothing, and the picture's corners are the sheet's.
      await expect(tile).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(tile).toHaveCSS("box-shadow", "none");
      await expect(tile.locator(".mav-dock-tile-media")).toHaveCSS(
        "border-radius",
        "0px",
      );
    }
    expect(loaded.length).toBeGreaterThan(12);
    expect(new Set(loaded)).toEqual(new Set([200]));
  });

test("four stones in the player's colour lie on the picture, over the frame and under the name", async ({
  page,
}) => {
  await open(page, 1);
  const tile = tileOf(page, "p1");
  await tile.evaluate((el) => {
    (el as HTMLElement).style.setProperty("--mav-dock-tile-color", "#2f6fd0");
  });

  // Rendered without colour, tinted by multiplying, their flashes left white.
  expect(await style(tile, "background-image", "::after")).toMatch(
    /art\/spark-2\.webp.*art\/stones-2\.webp/,
  );
  expect(await style(tile, "background-color", "::after")).toBe(
    "rgb(47, 111, 208)",
  );
  expect(await style(tile, "background-blend-mode", "::after")).toBe(
    "normal, multiply, normal",
  );
  expect(await style(tile, "mask-image", "::after")).toContain(
    "art/stones-2.webp",
  );
  // In their shadow, their colour.
  expect(await style(tile, "background-color", "::before")).toBe(
    "rgb(47, 111, 208)",
  );
  expect(await style(tile, "mask-image", "::before")).toContain(
    "art/shadow-2.webp",
  );
  // As large as the frame layer, taking no clicks.
  const [stones, frame] = await Promise.all(
    [tile, frameOf(tile)].map((target, i) =>
      target.evaluate(
        (el, pseudo) => {
          const s = getComputedStyle(el, pseudo);
          return [s.top, s.right, s.bottom, s.left, s.pointerEvents].join(" ");
        },
        i === 0 ? "::after" : null,
      ),
    ),
  );
  expect(stones).toBe(frame);
  // Over the frame layer, which has no level of its own, and under the name.
  expect(await style(frameOf(tile), "z-index")).toBe("auto");
  expect(await style(tile, "z-index", "::after")).toBe("1");
  expect(await style(tile.locator(".mav-dock-tile-bar"), "z-index")).toBe("2");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`while a player speaks their signs light and their stones glow, in place of the dock's ring, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    expect(await style(frameOf(tile), "opacity", "::after")).toBe("0");
    expect(await style(frameOf(tile), "opacity", "::before")).toBe("0");

    await speak(page, "p1");
    await expect(tile).toHaveAttribute("data-speaking", "");

    // The row of signs, in the one blue a voice has, and its glow.
    await expect
      .poll(() => style(frameOf(tile), "opacity", "::after"))
      .toBe("1");
    expect(await style(frameOf(tile), "mask-image", "::after")).toContain(
      "art/signs-2.svg",
    );
    expect(await style(frameOf(tile), "background-color", "::after")).toBe(
      "rgb(47, 109, 255)",
    );
    expect(await style(frameOf(tile), "opacity", "::before")).toBe("0.75");
    expect(await style(frameOf(tile), "mask-image", "::before")).toContain(
      "art/halo-2.svg",
    );
    // The stones brighten, and glow in their own colour.
    expect(await style(tile, "filter", "::after")).toContain("brightness");
    expect(await style(tile, "mask-image", "::before")).toContain(
      "art/glow-2.webp",
    );
    expect(await style(tile, "opacity", "::before")).toBe("1");
    // The ring is kept, clear: forced colours draw it, where a glow is lost.
    await expect(tile).toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
    await expect(tile).not.toHaveCSS("outline-style", "none");
  });

test("the player's own signs light only as far as their level", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  const meter = own.locator(".mav-meter");

  await expect(meter).toHaveCount(1);
  await expect(tileOf(page, "p1").locator(".mav-meter")).toHaveCount(0);
  // The meter is cut to the row of signs, and laid where it was drawn.
  expect(await style(meter, "mask-image")).toContain("art/signs-1.svg");
  const [row, tile] = [await boxOf(meter), await boxOf(own)];
  expect(row.y).toBeGreaterThan(tile.y + tile.height);
  expect(Math.abs(row.middle - tile.middle)).toBeLessThan(2);
  expect(row.width / tile.width).toBeCloseTo(0.84, 1);

  // The level lights them from the left, in a blue: the voice's while it
  // is sent, a paler one while it is too quiet for the gate.
  const fill = meter.locator(".mav-meter-fill");
  await expect(fill).toHaveCSS("transform-origin", /^0px /);
  await expect
    .poll(async () =>
      Number(/matrix\(([\d.]+)/.exec(await style(fill, "transform"))?.[1]),
    )
    .toBeGreaterThan(0);
  expect(["rgb(47, 109, 255)", "rgb(124, 143, 196)"]).toContain(
    await style(fill, "background-color"),
  );
  await expect(meter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await speak(page, "gm1");
  await expect(own).toHaveAttribute("data-speaking", "");

  // Not all at once: the meter says how far.
  expect(await style(frameOf(own), "opacity", "::after")).toBe("0");
  expect(await style(frameOf(own), "opacity", "::before")).toBe("0.75");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`a muted player's stones go dull, ${layout}`, async ({ page }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const [muted, other] = [tileOf(page, "p1"), tileOf(page, "p2")];

    await mute(page, "p1");
    await expect(muted).toHaveAttribute("data-muted", "");

    expect(await style(muted, "filter", "::after")).toMatch(
      /saturate\(0\.28\)/,
    );
    expect(await style(muted, "opacity", "::before")).toBe("0.25");
    expect(await style(other, "filter", "::after")).toBe("none");
    // Their signs stay dark: a muted player has no voice here.
    expect(await style(frameOf(muted), "opacity", "::after")).toBe("0");
  });

test("out of the call, a player's stones crack and lose their colour, and the picture dims", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");

  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  expect(await style(own, "background-image", "::after")).toMatch(
    /art\/cracks-1\.svg.*art\/stones-1\.webp/,
  );
  expect(await style(own, "background-color", "::after")).toBe(
    "rgb(141, 141, 144)",
  );
  expect(await style(own, "opacity", "::before")).toBe("0");
  // The sheet stays whole, and the picture is dark rather than a hole in it.
  await expect(own).toHaveCSS("opacity", "1");
  const media = own.locator(".mav-dock-tile-media");
  expect(await style(media, "filter")).toContain("brightness(0.42)");
  expect(await style(media, "background-color")).not.toBe("rgba(0, 0, 0, 0)");
  // Their level is no longer the blue of a voice that is sent.
  expect(
    await style(own.locator(".mav-meter-fill"), "background-color"),
  ).not.toBe("rgb(47, 109, 255)");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`the name is cut into a plate of bone over the picture's lower edge, in the middle, ${layout}`, async ({
    page,
  }) => {
    await open(page, 8);
    if (layout === "scattered") await scatter(page);

    for (const tile of await page.locator(".mav-dock-tile").all()) {
      const name = tile.locator(".mav-dock-tile-name");
      const [box, plate] = [await boxOf(tile), await boxOf(name)];

      // Measured, not judged by eye: a scroll that lies askew moves its boxes by a pixel at most.
      expect(Math.abs(plate.middle - box.middle)).toBeLessThan(
        layout === "scattered" ? 0.5 : 1.5,
      );
      expect(plate.y).toBeLessThan(box.y + box.height);
      expect(plate.y + plate.height).toBeGreaterThan(box.y + box.height);
      expect(plate.width).toBeLessThan(box.width);
    }
    const name = page.locator(".mav-dock-tile-name").first();
    expect(await style(name, "border-image-source")).toContain(
      "art/plate.webp",
    );
    await expect(name).toHaveCSS("font-family", /Modesto Condensed/);
    await expect(name).toHaveCSS("text-shadow", "none");
    await expect(name).toHaveCSS("text-overflow", "ellipsis");
    // Under the picture of bone, a colour to read contrast from.
    expect(await style(name, "background-color")).not.toBe("rgba(0, 0, 0, 0)");
  });

test("states hang on the scroll's left rod, clear of the face and the name", async ({
  page,
}) => {
  await open(page, 1);
  const tile = tileOf(page, "p1");
  await mute(page, "p1");
  await page.evaluate(() =>
    window.harness?.ui?.players.p1?.commands.setDeafened(true),
  );
  const tags = tile.locator(".mav-dock-tile-indicators");
  await expect(tags.locator(".mav-indicator")).toHaveCount(2);

  const [box, hung, plate, frame] = [
    await boxOf(tile),
    await boxOf(tags),
    await boxOf(tile.locator(".mav-dock-tile-name")),
    await boxOf(frameOf(tile)),
  ];

  // One under another, from the frame layer's left edge: over the rod, not past it.
  await expect(tags).toHaveCSS("flex-direction", "column");
  expect(Math.abs(hung.x - frame.x)).toBeLessThan(3);
  // Inside the margin a frame may cover, and above the name's plate.
  expect(hung.x + hung.width).toBeLessThan(box.x + box.width * 0.15);
  expect(hung.y + hung.height).toBeLessThan(plate.y);
  expect(hung.y).toBeGreaterThan(box.y);
});

test("in a grid the scrolls lie a little askew and apart; scattered, as the player laid them", async ({
  page,
}) => {
  // Nine cameras: two columns in a dock 300 pixels wide.
  await open(page, 8);
  const tiles = await page.locator(".mav-dock-tile").all();

  const turns = await Promise.all(tiles.map((tile) => style(tile, "rotate")));
  expect(new Set(turns).size).toBe(5);
  for (const turn of turns)
    expect(Math.abs(parseFloat(turn))).toBeLessThanOrEqual(1.1);
  // The whole tile turns: the picture stays in its sheet.
  expect(await style(frameOf(tileOf(page, "p1")), "rotate")).toBe("none");
  // A little desk between neighbours, on top of the room each scroll has to
  // itself: one gap both ways, as the dock fits its grid with one. Measured
  // as laid out, before the turn (a turned box is a little larger).
  await expect(list(page)).toHaveCSS("row-gap", "4px");
  await expect(list(page)).toHaveCSS("column-gap", "4px");
  const laid = await page.locator(".mav-dock-tile").evaluateAll((all) =>
    all.map((tile) => {
      const frame = tile.querySelector<HTMLElement>(".mav-dock-tile-frame");
      const el = tile as HTMLElement;
      return {
        left: el.offsetLeft + (frame?.offsetLeft ?? 0),
        top: el.offsetTop + (frame?.offsetTop ?? 0),
        width: frame?.offsetWidth ?? 0,
        height: frame?.offsetHeight ?? 0,
      };
    }),
  );
  const [first, beside, under] = laid;
  if (!first || !beside || !under) throw new Error("No tiles");
  expect(beside.top).toBe(first.top);
  expect(under.left).toBe(first.left);
  expect(beside.left - (first.left + first.width)).toBeGreaterThanOrEqual(3.5);
  expect(under.top - (first.top + first.height)).toBeGreaterThanOrEqual(3.5);

  await scatter(page);

  for (const tile of tiles) expect(await style(tile, "rotate")).toBe("none");
});

test("loads only its own stylesheet, and only while chosen", async ({
  page,
}) => {
  await open(page, 1);
  const sheet = (): Promise<string> =>
    style(frameOf(tileOf(page, "p1")), "background-image");

  await expect(page.locator("html")).toHaveClass(/mav-theme-scrolls/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-scrolls/scrolls.css",
  );
  expect(await sheet()).toContain("art/scroll-");

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(sheet).toBe("none");
});

test("is offered without it: the dock's own look stays", async ({ page }) => {
  await open(page, 1, "");

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await page.locator(".mav-dock-settings").click();
  await page.getByRole("tab", { name: "Appearance" }).click();
  // The harness's user is a GM: one theme, for everyone.
  const choice = page.getByLabel("Theme for everyone", { exact: true });
  await expect(choice).toHaveValue("default");
  await expect(choice.locator("option")).toHaveText([
    "Modular A/V's own look",
    "Scrolls (a wizard's desk)",
  ]);
});

test("suggests a docked layout, where the dock is the desk, leaving the dock where it is", async ({
  page,
}) => {
  await open(page, 1);
  await place(page, /^Floating/);
  await expect(page.locator(".mav-dock")).toHaveAttribute(
    "data-placement",
    "floating",
  );

  await page.locator(".mav-dock-placement").click();

  for (const side of [
    "on the left",
    "on the right",
    "at the top",
    "at the bottom",
  ])
    await expect(
      page.getByRole("menuitemradio", {
        name: `Docked ${side} (the theme's suggestion)`,
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
                themed:
                  doc.documentElement.classList.contains("mav-theme-scrolls"),
                sheet:
                  getComputedStyle(frame).backgroundImage.includes(
                    "art/scroll-",
                  ),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, sheet: true });
  });

test("the docked grid settles with scrolls that reach past the tiles", async ({
  page,
}) => {
  await page.goto(
    `/?module=${MODULES}&service=mock&sample=1&players=p1,p2&theme=scrolls`,
  );
  await expect(page.locator(".mav-dock-tile")).toHaveCount(3, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);

  // Frames make the list's height follow its tiles: no flipping between
  // two widths, frame after frame.
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
});
