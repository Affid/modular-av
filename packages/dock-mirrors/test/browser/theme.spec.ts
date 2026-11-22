// The mirrors theme: the theme contract in each layout, the hands that
// hold each camera and what the glass shows of its player, and what the
// dock does with a theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, test } from "@playwright/test";
import {
  boxOf,
  deafen,
  frameOf,
  leave,
  MODULES,
  mute,
  open,
  place,
  poseOf,
  scatter,
  speak,
  style,
  styleOf,
  tileOf,
} from "./page.ts";

themeContract({
  modules: MODULES,
  theme: "mirrors",
  layouts: [
    "Docked on the left",
    "Docked at the top",
    "Floating",
    "Scattered over the screen",
  ],
});

test.use({ viewport: { width: 1280, height: 900 } });

const CLEAR = "rgba(0, 0, 0, 0)";

for (const layout of ["in a grid", "scattered"] as const)
  test(`two hands out of the glass hold each camera, and the camera's own frame is gone, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const hands = await styleOf(
      frameOf(tile),
      ["background-image", "background-size", "mask-image", "pointer-events"],
      "::before",
    );

    expect(hands["background-image"]).toMatch(/art\/hands-[12]\.webp/);
    expect(hands["background-size"]).toBe("100% 100%");
    // The wrists fade into the glass before the frame layer's edge.
    expect(hands["mask-image"]).toContain("linear-gradient");
    await expect(tile).toHaveCSS("border-top-color", CLEAR);
    await expect(tile).toHaveCSS("background-color", CLEAR);
    await expect(tile).toHaveCSS("box-shadow", "none");
    // With the camera on, the glass shows round the video: the media has no ground of its own.
    const media = tile.locator(".mav-dock-tile-media");
    expect(await style(media, "background-image")).toBe("none");
  });

test("a camera that is off is black glass reflecting a window, held all the same", async ({
  page,
}) => {
  await open(page, 1);
  await page.evaluate(() =>
    window.harness?.ui?.players.p1?.commands.setVideoEnabled(false),
  );
  const tile = tileOf(page, "p1");
  await expect(tile).not.toHaveAttribute("data-video", "on");

  expect(
    await style(tile.locator(".mav-dock-tile-media"), "background-image"),
  ).toContain("art/offpane.webp");
  expect(await style(frameOf(tile), "background-image", "::before")).toContain(
    "art/hands-2.webp",
  );
});

test("in one column every other camera is held in the other pose", async ({
  page,
}) => {
  await open(page, 2);
  const poses = await Promise.all(
    ["gm1", "p1", "p2"].map((id) => poseOf(tileOf(page, id))),
  );

  expect(poses).toEqual([1, 2, 1]);
});

test("two to a row, the rows take turns, so no camera is held as its neighbour beside or above it is", async ({
  page,
}) => {
  await open(page, 8);
  const tiles = page.locator(".mav-dock-tile");
  await expect
    .poll(() =>
      page
        .locator(".mav-dock-tiles")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--mav-dock-columns").trim(),
        ),
    )
    .toBe("2");
  const poses: number[] = [];
  for (let i = 0; i < 9; i += 1) poses.push(await poseOf(tiles.nth(i)));

  expect(poses).toEqual([1, 2, 2, 1, 1, 2, 2, 1, 1]);
  for (let i = 0; i < poses.length; i += 1) {
    if (i % 2 === 1) expect(poses[i]).not.toBe(poses[i - 1]);
    if (i >= 2) expect(poses[i]).not.toBe(poses[i - 2]);
  }
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
  test(`a voice wells up as light in the glass where the hands come out, and lights the hands, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const light = (): Promise<string> =>
      style(tile, "background-image", "::before");
    expect(await light()).toContain("art/light-rest-2.webp");

    await speak(page, "p1");
    await expect(tile).toHaveAttribute("data-speaking", "");

    await expect.poll(light).toContain("art/light-speak-2.webp");
    expect(await style(frameOf(tile), "filter", "::before")).toContain(
      "hue-rotate",
    );
    // The light lies behind the picture, exactly over the frame layer's box.
    const [glow, frame] = [
      await tile.evaluate((el) => {
        const s = getComputedStyle(el, "::before");
        return { z: s.zIndex, events: s.pointerEvents };
      }),
      await boxOf(frameOf(tile)),
    ];
    expect(glow).toEqual({ z: "-1", events: "none" });
    expect(frame.width).toBeGreaterThan(0);
    // Nothing is blended against the camera's picture.
    for (const pseudo of [null, "::before", "::after"] as const)
      expect(await style(frameOf(tile), "mix-blend-mode", pseudo)).toBe(
        "normal",
      );
    // The dock's ring is kept, clear: forced colours draw it.
    await expect(tile).toHaveCSS("outline-color", CLEAR);
  });

test("a muted player's mirror fogs with breath round the picture, its light sinks and the hands dull", async ({
  page,
}) => {
  await open(page, 2);
  const [muted, other] = [tileOf(page, "p1"), tileOf(page, "p2")];
  expect(await style(frameOf(muted), "background-image")).toBe("none");

  await mute(page, "p1");
  await expect(muted).toHaveAttribute("data-muted", "");

  expect(await style(frameOf(muted), "background-image")).toContain(
    "art/fog.webp",
  );
  expect(await style(muted, "opacity", "::before")).toBe("0.3");
  expect(await style(frameOf(muted), "filter", "::before")).toBe(
    "brightness(0.7) saturate(0.5)",
  );
  expect(await style(frameOf(other), "background-image")).toBe("none");
});

test("a deafened player's hands let their grip go slack, and the light round them is stopped down", async ({
  page,
}) => {
  await open(page, 2);
  const [deaf, other] = [tileOf(page, "p1"), tileOf(page, "p2")];

  await deafen(page, "p1");
  await expect(deaf).toHaveAttribute("data-deafened", "");

  await expect
    .poll(() => style(frameOf(deaf), "opacity", "::before"))
    .toBe("0.6");
  expect(await style(frameOf(deaf), "scale", "::before")).toBe("1.015");
  expect(await style(frameOf(other), "opacity", "::before")).toBe("1");
});

test("out of the call the mirror is smoked and cracked, the hands let go, the gem greys and no light is left", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");

  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  expect(await style(frameOf(own), "background-image")).toContain(
    "art/crack.webp",
  );
  await expect
    .poll(() => style(frameOf(own), "opacity", "::before"))
    .toBe("0.32");
  expect(await style(own, "opacity", "::before")).toBe("0");
  await expect(own).toHaveCSS("opacity", "1");
  const media = own.locator(".mav-dock-tile-media");
  expect(await style(media, "background-image")).toContain("art/offpane.webp");
  expect(await style(media, "background-image")).toContain("linear-gradient");
  // The gem's colour is mixed toward grey.
  expect(
    await own.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--mirrors-gem-under"),
    ),
  ).toContain("color-mix");
});

test("the player's colour is a gem in a silver collet before the name, the name centred by an empty box after it", async ({
  page,
}) => {
  await open(page, 2, "mirrors", "&colours=1");
  const name = tileOf(page, "p1").locator(".mav-dock-tile-name");
  const gem = await styleOf(
    name,
    ["background-image", "background-blend-mode", "mask-image", "width"],
    "::before",
  );

  expect(gem["background-image"]).toContain("art/gem-stone.webp");
  expect(gem["background-image"]).toContain("art/gem-collet.webp");
  expect(gem["background-blend-mode"]).toBe(
    "normal, normal, hard-light, normal",
  );
  expect(gem["mask-image"]).toContain("art/gem-collet.webp");
  expect(await style(name, "width", "::after")).toBe(gem.width);
  const colour = await tileOf(page, "p1").evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--mav-dock-tile-color").trim(),
  );
  expect(gem["background-image"]).toContain("radial-gradient");
  expect(colour).not.toBe("");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`the name is lettered on the glass under the picture, in the middle, with no plate of its own, ${layout}`, async ({
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
  });

test("your own level lights marks cut into the glass above your picture; no other camera has them", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  const meter = own.locator(".mav-meter");

  await expect(meter).toHaveCount(1);
  await expect(tileOf(page, "p1").locator(".mav-meter")).toHaveCount(0);
  expect(await style(meter, "mask-image")).toContain("art/sigil-mask.webp");
  expect(await style(meter, "background-image")).toContain(
    "art/sigil-cut.webp",
  );
  expect(await style(meter, "background-image", "::after")).toContain(
    "art/sigil-shade.webp",
  );
  const [marks, tile] = [await boxOf(meter), await boxOf(own)];
  // Above the picture, across its middle: 21% in from each side.
  expect(marks.y).toBeLessThan(tile.y);
  expect((marks.x - tile.x) / tile.width).toBeCloseTo(0.21, 2);
  expect(marks.width / tile.width).toBeCloseTo(0.58, 2);

  // Lit while the voice is sent: pale lavender held in the cuts.
  await expect(meter).toHaveAttribute("data-open", "");
  await expect(meter.locator(".mav-meter-fill")).toHaveCSS(
    "background-color",
    "rgb(196, 182, 236)",
  );
});

test("states stand on the picture's upper left corner and another module's badge on its upper right, on chips of glass", async ({
  page,
}) => {
  await open(page, 1, "mirrors", "&sample=1");
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
  expect(await style(icon, "border-image-source")).toContain("art/chip.webp");
});

test("loads only its own stylesheet, and only while chosen", async ({
  page,
}) => {
  await open(page, 1);
  const hands = (): Promise<string> =>
    style(frameOf(tileOf(page, "p1")), "background-image", "::before");

  await expect(page.locator("html")).toHaveClass(/mav-theme-mirrors/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-mirrors/mirrors.css",
  );
  expect(await hands()).toContain("art/hands-");

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(hands).not.toContain("art/hands-");
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
    "Mirrors (a warlock's black mirror)",
  ]);
});

test("suggests a docked layout, where the dock is the mirror, leaving the dock where it is", async ({
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
                themed:
                  doc.documentElement.classList.contains("mav-theme-mirrors"),
                hands: getComputedStyle(
                  frame,
                  "::before",
                ).backgroundImage.includes("art/hands-"),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, hands: true });
  });

test("the docked grid settles with hands that reach past the tiles", async ({
  page,
}) => {
  await page.goto(
    `/?module=${MODULES}&service=mock&sample=1&players=p1,p2&theme=mirrors`,
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
