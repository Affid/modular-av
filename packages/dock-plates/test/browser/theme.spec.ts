// The plates theme: the theme contract in each layout, each camera's
// plate and what it shows of its player, and what the dock does with a
// theme module (only its stylesheet, in every window).
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, test } from "@playwright/test";
import {
  boxOf,
  frameOf,
  leave,
  MODULES,
  mute,
  open,
  place,
  scatter,
  speak,
  style,
  styleOf,
  tileOf,
} from "./page.ts";

themeContract({
  modules: MODULES,
  theme: "plates",
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
  test(`each camera sits in a plate of steel: one of two plates, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    // The viewer's tile is the first, then the players in their order.
    const [own, ...others] = ["gm1", "p1", "p2"].map((id) =>
      frameOf(tileOf(page, id)),
    );
    if (!own) throw new Error("No tile of the viewer's own");

    // The viewer's own plate has the knife on it; no other has.
    const mine = await style(own, "background-image");
    expect(mine).toContain("art/knife.webp");
    expect(mine).toContain("art/plate-1.webp");
    for (const [i, plate] of others.entries()) {
      const image = await style(plate, "background-image");
      expect(image).toContain(`art/plate-${String(((i + 1) % 2) + 1)}.webp`);
      expect(image).not.toContain("art/knife.webp");
      await expect(plate).toHaveCSS("background-size", "100% 100%, 100% 100%");
    }
    // The frame is the plate's own: the tile draws none, and a camera that is off is no hole.
    const tile = tileOf(page, "p1");
    await expect(tile).toHaveCSS("border-top-color", CLEAR);
    await expect(tile).toHaveCSS("background-color", CLEAR);
    await expect(tile).toHaveCSS("box-shadow", "none");
    expect(
      await style(tile.locator(".mav-dock-tile-media"), "background-color"),
    ).not.toBe(CLEAR);
  });

test("a cord in the player's colour is laced round the plate, dyed inside its own layer", async ({
  page,
}) => {
  await open(page, 2, "plates", "&colours=1");
  const [one, two] = [tileOf(page, "p1"), tileOf(page, "p2")];
  const colourOf = async (id: string): Promise<string> => {
    // The colour the dock gives the tile, as the browser writes a colour.
    return tileOf(page, id).evaluate((el) => {
      const probe = document.createElement("i");
      probe.style.color = getComputedStyle(el).getPropertyValue(
        "--mav-dock-tile-color",
      );
      el.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
  };

  for (const [tile, plate] of [
    [one, 2],
    [two, 1],
  ] as const) {
    const cord = await styleOf(
      frameOf(tile),
      ["background-image", "mask-image", "background-blend-mode"],
      "::after",
    );
    // The same picture twice: the cord's light and shade, and where it is.
    expect(cord["background-image"]).toContain(
      `art/cord-${String(plate)}.webp`,
    );
    expect(cord["mask-image"]).toContain(`art/cord-${String(plate)}.webp`);
    expect(cord["background-blend-mode"]).toBe("multiply, normal");
  }
  expect(await style(frameOf(one), "background-color", "::after")).toBe(
    await colourOf("p1"),
  );
  expect(await colourOf("p1")).not.toBe(await colourOf("p2"));
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`while a player speaks their plate is polished, in place of the dock's ring, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    expect(await style(frameOf(tile), "opacity", "::before")).toBe("0");

    await speak(page, "p1");
    await expect(tile).toHaveAttribute("data-speaking", "");

    await expect
      .poll(() => style(frameOf(tile), "opacity", "::before"))
      .toBe("1");
    // The same plate, polished, over the dull one.
    expect(
      await style(frameOf(tile), "background-image", "::before"),
    ).toContain("art/plate-polished-2.webp");
    // Nothing is blended against the camera's picture under it: that would change how the picture is drawn.
    for (const pseudo of [null, "::before", "::after"] as const)
      expect(await style(frameOf(tile), "mix-blend-mode", pseudo)).toBe(
        "normal",
      );
    // The ring is kept, clear: forced colours draw it, where a polish is lost.
    await expect(tile).toHaveCSS("outline-color", CLEAR);
    await expect(tile).not.toHaveCSS("outline-style", "none");

    await speak(page, "p1", false);
    await expect(tile).not.toHaveAttribute("data-speaking");
    await expect
      .poll(() => style(frameOf(tile), "opacity", "::before"))
      .toBe("0");
  });

test("the player's own level shines along the blade of the knife under their name; no other plate has a knife", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  const meter = own.locator(".mav-meter");

  await expect(meter).toHaveCount(1);
  await expect(tileOf(page, "p1").locator(".mav-meter")).toHaveCount(0);
  // The meter is cut to the blade, and laid where the knife was rendered: under the name, on the plate.
  expect(await style(meter, "mask-image")).toContain("art/blade.webp");
  const [blade, tile, name, plate] = [
    await boxOf(meter),
    await boxOf(own),
    await boxOf(own.locator(".mav-dock-tile-name")),
    await boxOf(frameOf(own)),
  ];
  expect(blade.y).toBeGreaterThan(tile.y + tile.height);
  expect(blade.y).toBeGreaterThanOrEqual(name.y + name.height - 2);
  expect(blade.y + blade.height).toBeLessThan(plate.y + plate.height);
  // From past the guard to past the point: 28% in from the tile's left, 57.6% of its width long.
  expect((blade.x - tile.x) / tile.width).toBeCloseTo(0.28, 2);
  expect(blade.width / tile.width).toBeCloseTo(0.576, 2);
  // Unlit, the blade is the rendered knife's own: the meter paints nothing there.
  await expect(meter).toHaveCSS("background-color", CLEAR);
  // The mark where the voice gate opens is the dock's to show or hide: the theme doesn't take it away.
  expect(
    await meter.locator(".mav-meter-threshold").evaluate((mark) => {
      const hidden = (mark as HTMLElement).hidden;
      (mark as HTMLElement).hidden = false;
      const shown = getComputedStyle(mark).display;
      (mark as HTMLElement).hidden = hidden;
      return shown;
    }),
  ).not.toBe("none");

  // The level lights it from the guard: bright while it is sent.
  const fill = meter.locator(".mav-meter-fill");
  await expect(fill).toHaveCSS("transform-origin", /^0px /);
  await expect
    .poll(async () =>
      Number(/matrix\(([\d.]+)/.exec(await style(fill, "transform"))?.[1]),
    )
    .toBeGreaterThan(0);
  await expect(meter).toHaveAttribute("data-open", "");
  const lit = await style(fill, "background-image");
  expect(lit).toContain("rgb(247, 249, 251)");
  expect(lit).not.toContain("rgb(143, 150, 157)");
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`a muted player's plate goes dull and dark, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const [muted, other] = [tileOf(page, "p1"), tileOf(page, "p2")];
    expect(await style(frameOf(muted), "filter")).toBe("none");

    await mute(page, "p1");
    await expect(muted).toHaveAttribute("data-muted", "");

    expect(await style(frameOf(muted), "filter")).toBe(
      "brightness(0.6) saturate(0.55)",
    );
    expect(await style(frameOf(other), "filter")).toBe("none");
  });

test("out of the call, the plate has rusted, its cord is lost down one side and faded, and the picture dims", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  expect(await style(frameOf(own), "background-image")).toContain(
    "art/plate-1.webp",
  );

  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  const plate = await style(frameOf(own), "background-image");
  expect(plate).toContain("art/plate-out-1.webp");
  // Their knife is still theirs.
  expect(plate).toContain("art/knife.webp");
  const cord = await styleOf(
    frameOf(own),
    ["background-image", "mask-image", "filter"],
    "::after",
  );
  expect(cord["background-image"]).toContain("art/cord-out-1.webp");
  expect(cord["mask-image"]).toContain("art/cord-out-1.webp");
  expect(cord.filter).toBe("saturate(0.35) brightness(0.75)");
  // The plate stays whole, and the picture is dark rather than a hole in it.
  await expect(own).toHaveCSS("opacity", "1");
  const media = own.locator(".mav-dock-tile-media");
  expect(await style(media, "filter")).toContain("brightness(0.42)");
  expect(await style(media, "background-color")).not.toBe(CLEAR);
  // Their level no longer shines: the blade is dull steel, not lit.
  const blade = await style(own.locator(".mav-meter-fill"), "background-image");
  expect(blade).toContain("rgb(143, 150, 157)");
  expect(blade).not.toContain("rgb(247, 249, 251)");
});

test("a plate out of the call is never polished, even while its player is marked speaking", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  // Both at once, as when speaking is cleared a moment after the call is left: read at once, before the dock
  // takes the mark back.
  const polish = await own.evaluate((tile) => {
    const frame = tile.querySelector(".mav-dock-tile-frame");
    if (!frame) throw new Error("No frame layer");
    tile.setAttribute("data-speaking", "");
    const opacity = getComputedStyle(frame, "::before").opacity;
    tile.removeAttribute("data-speaking");
    return opacity;
  });

  expect(polish).toBe("0");
});

test("the polish comes over a fifth of a second, and at once under reduced motion", async ({
  page,
}) => {
  await open(page, 1);
  const frame = frameOf(tileOf(page, "p1"));
  // `open` asks for reduced motion, as every other test wants.
  expect(await style(frame, "transition-duration", "::before")).toBe("0s");

  await page.emulateMedia({ reducedMotion: "no-preference" });

  expect(
    await styleOf(
      frame,
      ["transition-property", "transition-duration"],
      "::before",
    ),
  ).toEqual({
    "transition-property": "opacity",
    "transition-duration": "0.2s",
  });
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`the name is cut into the plate under the picture, in the middle, with no plate of its own, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const name = tile.locator(".mav-dock-tile-name");

    // Bright letters on the steel itself.
    await expect(name).toHaveCSS("color", "rgb(223, 226, 230)");
    await expect(name).toHaveCSS("background-color", CLEAR);
    await expect(name).toHaveCSS("border-image-source", "none");
    const [box, cut, plate] = [
      await boxOf(tile),
      await boxOf(name),
      await boxOf(frameOf(tile)),
    ];
    expect(Math.abs(cut.middle - box.middle)).toBeLessThan(2);
    // Its middle 5.5% of the tile's width under the picture: in the black band.
    const middle = cut.y + cut.height / 2;
    expect(middle - (box.y + box.height)).toBeCloseTo(box.width * 0.055, 0);
    expect(cut.y + cut.height).toBeLessThan(plate.y + plate.height);
  });

test("states stand at the plate's upper left corner and another module's badge at its upper right, clear of the face and the name", async ({
  page,
}) => {
  await open(page, 1, "plates", "&sample=1");
  const tile = tileOf(page, "p1");
  await mute(page, "p1");
  await page.evaluate(() => {
    void window.harness?.ui?.players.p1?.commands.setDeafened(true);
    window.harness?.sample?.setIndicated(["p1"]);
  });
  const states = tile.locator(".mav-dock-tile-indicators");
  const badges = tile.locator(".mav-dock-tile-badges");
  await expect(states.locator(".mav-indicator")).toHaveCount(2);
  await expect(badges.locator("> *")).toHaveCount(1);

  const [box, hung, pinned, cut, frame] = [
    await boxOf(tile),
    await boxOf(states),
    await boxOf(badges),
    await boxOf(tile.locator(".mav-dock-tile-name")),
    await boxOf(frameOf(tile)),
  ];

  // One under another, from a little onto the plate's side: never past the plate.
  await expect(states).toHaveCSS("flex-direction", "column");
  expect(hung.x).toBeLessThan(box.x);
  expect(hung.x).toBeGreaterThanOrEqual(frame.x);
  expect(pinned.x + pinned.width).toBeGreaterThan(box.x + box.width);
  expect(pinned.x + pinned.width).toBeLessThanOrEqual(frame.x + frame.width);
  // Inside the margin a frame may cover, and above the name.
  expect(hung.x + hung.width).toBeLessThan(box.x + box.width * 0.15);
  expect(pinned.x).toBeGreaterThan(box.x + box.width * 0.85);
  for (const column of [hung, pinned]) {
    expect(column.y + column.height).toBeLessThan(cut.y);
    expect(column.y).toBeGreaterThan(box.y);
  }
});

test("state icons shrink with a small camera and are full size on a large one", async ({
  page,
}) => {
  const sizeOf = async (players: number): Promise<number> => {
    await open(page, players);
    await mute(page, "p1");
    const icon = tileOf(page, "p1").locator(".mav-indicator").first();
    await expect(icon).toBeVisible();
    return (await boxOf(icon)).height;
  };

  // Two cameras are large (over 160 wide); nine, two abreast, are the smallest.
  expect(await sizeOf(1)).toBe(20);
  const small = await sizeOf(8);
  expect(small).toBeLessThan(17);
  expect(small).toBeGreaterThanOrEqual(15);
});

test("plates lie straight, side by side and never on each other", async ({
  page,
}) => {
  await open(page, 8);
  const frames = await page.locator(".mav-dock-tile-frame").evaluateAll((all) =>
    all.map((el) => {
      const box = el.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        turned: getComputedStyle(el.parentElement ?? el).rotate,
      };
    }),
  );

  expect(frames).toHaveLength(9);
  for (const frame of frames) expect(frame.turned).toBe("none");
  for (const [i, a] of frames.entries())
    for (const b of frames.slice(i + 1)) {
      const apart =
        a.right <= b.left + 0.5 ||
        b.right <= a.left + 0.5 ||
        a.bottom <= b.top + 0.5 ||
        b.bottom <= a.top + 0.5;
      expect(apart).toBe(true);
    }
});

test("loads only its own stylesheet, and only while chosen", async ({
  page,
}) => {
  await open(page, 1);
  const plate = (): Promise<string> =>
    style(frameOf(tileOf(page, "p1")), "background-image");

  await expect(page.locator("html")).toHaveClass(/mav-theme-plates/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-plates/plates.css",
  );
  expect(await plate()).toContain("art/plate-");

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(plate).toBe("none");
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
    "Plates (a fighter's harness)",
  ]);
});

test("suggests a docked layout, where the dock is the mail, leaving the dock where it is", async ({
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
                  doc.documentElement.classList.contains("mav-theme-plates"),
                plate:
                  getComputedStyle(frame).backgroundImage.includes(
                    "art/plate-",
                  ),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, plate: true });
  });

test("the docked grid settles with plates that reach past the tiles", async ({
  page,
}) => {
  await page.goto(
    `/?module=${MODULES}&service=mock&sample=1&players=p1,p2&theme=plates`,
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
  // And that one width is a width: the dock has fitted its grid.
  expect(seen[0]).toMatch(/^\d+(\.\d+)?px$/);
});
