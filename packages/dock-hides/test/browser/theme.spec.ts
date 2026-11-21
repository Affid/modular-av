// The hides theme: the theme contract in each layout, each camera's hide
// and what it shows of its player, and what the dock does with a theme
// module (only its stylesheet, in every window).
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
  theme: "hides",
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
  test(`each camera is a picture on a hide in a frame of poles: one of two hides, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    // The viewer's tile is the first, then the players in their order.
    const hides = ["gm1", "p1", "p2"].map((id) => frameOf(tileOf(page, id)));

    for (const [i, hide] of hides.entries()) {
      const image = await style(hide, "background-image");
      expect(image).toContain(`art/hide-${String((i % 2) + 1)}.webp`);
      // One picture: the hide. No other hide has tally marks on it.
      expect(image.split("url(")).toHaveLength(2);
      await expect(hide).toHaveCSS("background-size", "100% 100%");
    }
    // The frame is the hide's own: the tile draws none, and a camera that is off is no hole.
    const tile = tileOf(page, "p1");
    await expect(tile).toHaveCSS("border-top-color", CLEAR);
    await expect(tile).toHaveCSS("background-color", CLEAR);
    await expect(tile).toHaveCSS("box-shadow", "none");
    expect(
      await style(tile.locator(".mav-dock-tile-media"), "background-color"),
    ).not.toBe(CLEAR);
  });

test("war paint in the player's colour is daubed round the picture, with the hide's grain in it", async ({
  page,
}) => {
  await open(page, 2, "hides", "&colours=1");
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

  for (const [tile, hide] of [
    [one, 2],
    [two, 1],
  ] as const) {
    const paint = await styleOf(
      frameOf(tile),
      ["background-image", "mask-image", "background-blend-mode"],
      "::after",
    );
    // The same picture twice: what is painted, and where.
    expect(paint["background-image"]).toContain(
      `art/paint-${String(hide)}.webp`,
    );
    expect(paint["mask-image"]).toContain(`art/paint-${String(hide)}.webp`);
    expect(paint["background-blend-mode"]).toBe("multiply, normal");
  }
  expect(await style(frameOf(one), "background-color", "::after")).toBe(
    await colourOf("p1"),
  );
  expect(await colourOf("p1")).not.toBe(await colourOf("p2"));
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`while a player speaks firelight shows through their hide, in place of the dock's ring, ${layout}`, async ({
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
      .toBe("0.5");
    // The hide drawn once more, lit, and only where the hide itself is: never on the poles.
    const lit = await styleOf(
      frameOf(tile),
      ["background-image", "background-blend-mode", "mask-image"],
      "::before",
    );
    expect(lit["background-image"]).toMatch(
      /radial-gradient.*art\/hide-2\.webp/,
    );
    expect(lit["background-blend-mode"]).toBe("hard-light, normal");
    expect(lit["mask-image"]).toContain("art/light-2.webp");
    // Nothing is blended against the camera's picture under it: that would change how the picture is drawn.
    for (const pseudo of [null, "::before", "::after"] as const)
      expect(await style(frameOf(tile), "mix-blend-mode", pseudo)).toBe(
        "normal",
      );
    // The ring is kept, clear: forced colours draw it, where a glow is lost.
    await expect(tile).toHaveCSS("outline-color", CLEAR);
    await expect(tile).not.toHaveCSS("outline-style", "none");
  });

test("the player's own tally marks light only as far as their level; no other hide has any", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");
  const meter = own.locator(".mav-meter");

  await expect(meter).toHaveCount(1);
  await expect(tileOf(page, "p1").locator(".mav-meter")).toHaveCount(0);
  // The meter is cut to the marks, and laid where they were drawn: under the name, in the middle.
  expect(await style(meter, "mask-image")).toContain("art/tally.svg");
  const [row, tile, name] = [
    await boxOf(meter),
    await boxOf(own),
    await boxOf(own.locator(".mav-dock-tile-name")),
  ];
  expect(row.y).toBeGreaterThan(tile.y + tile.height);
  expect(row.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  expect(Math.abs(row.middle - tile.middle)).toBeLessThan(2);
  expect(row.width / tile.width).toBeCloseTo(0.74, 2);
  // Where the voice doesn't reach the marks are dark paint, not nothing.
  await expect(meter).toHaveCSS("background-color", "rgba(53, 25, 13, 0.82)");

  // The level lights them from the left: firelight while it is sent, paler while it is too quiet for the gate.
  const fill = meter.locator(".mav-meter-fill");
  await expect(fill).toHaveCSS("transform-origin", /^0px /);
  await expect
    .poll(async () =>
      Number(/matrix\(([\d.]+)/.exec(await style(fill, "transform"))?.[1]),
    )
    .toBeGreaterThan(0);
  const lit = await styleOf(fill, ["background-image", "background-color"]);
  expect(
    lit["background-image"]?.includes("linear-gradient") === true ||
      lit["background-color"] === "rgb(201, 162, 106)",
  ).toBe(true);
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`a muted player's hide goes dark and dry, ${layout}`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") await scatter(page);
    const [muted, other] = [tileOf(page, "p1"), tileOf(page, "p2")];

    await mute(page, "p1");
    await expect(muted).toHaveAttribute("data-muted", "");

    expect(await style(frameOf(muted), "filter")).toBe(
      "saturate(0.5) brightness(0.68)",
    );
    expect(await style(frameOf(other), "filter")).toBe("none");
    // No firelight: a muted player has no voice here.
    expect(await style(frameOf(muted), "opacity", "::before")).toBe("0");
  });

test("out of the call, the thongs of one corner are cut, the paint is all but gone and the picture dims", async ({
  page,
}) => {
  await open(page, 1);
  const own = tileOf(page, "gm1");

  await leave(page);
  await expect(own).not.toHaveAttribute("data-connected");

  expect(await style(frameOf(own), "background-image")).toContain(
    "art/hide-cut-1.webp",
  );
  expect(await style(frameOf(own), "filter")).toBe(
    "saturate(0.6) brightness(0.82)",
  );
  expect(await style(frameOf(own), "opacity", "::after")).toBe("0.28");
  // The hide stays whole, and the picture is dark rather than a hole in it.
  await expect(own).toHaveCSS("opacity", "1");
  const media = own.locator(".mav-dock-tile-media");
  expect(await style(media, "filter")).toContain("brightness(0.42)");
  expect(await style(media, "background-color")).not.toBe(CLEAR);
  // Their level is no longer firelight.
  expect(await style(own.locator(".mav-meter-fill"), "background-image")).toBe(
    "none",
  );
});

for (const layout of ["in a grid", "scattered"] as const)
  test(`the name is branded into a tag of rawhide over the picture's lower edge, in the middle, ${layout}`, async ({
    page,
  }) => {
    await open(page, 1);
    if (layout === "scattered") await scatter(page);
    const tile = tileOf(page, "p1");
    const name = tile.locator(".mav-dock-tile-name");

    expect(await style(name, "border-image-source")).toContain("art/tag.webp");
    await expect(name).toHaveCSS("border-image-slice", "0 70 fill");
    // Dark on pale, with rawhide's own colour under the picture for contrast.
    await expect(name).toHaveCSS("color", "rgb(42, 20, 8)");
    await expect(name).toHaveCSS("background-color", "rgb(216, 195, 154)");
    const [box, tag] = [await boxOf(tile), await boxOf(name)];
    expect(Math.abs(tag.middle - box.middle)).toBeLessThan(2);
    expect(tag.y).toBeLessThan(box.y + box.height);
    expect(tag.y + tag.height).toBeGreaterThan(box.y + box.height);
    // No more of the picture than its lower edge.
    expect(tag.y).toBeGreaterThan(box.y + box.height * 0.85);
  });

test("states hang on the frame's left pole and another module's badge on the right one, clear of the face and the name", async ({
  page,
}) => {
  await open(page, 1, "hides", "&sample=1");
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

  const [box, hung, pinned, tag, frame] = [
    await boxOf(tile),
    await boxOf(states),
    await boxOf(badges),
    await boxOf(tile.locator(".mav-dock-tile-name")),
    await boxOf(frameOf(tile)),
  ];

  // One under another, from the frame layer's edge: over the pole, not past it.
  await expect(states).toHaveCSS("flex-direction", "column");
  expect(Math.abs(hung.x - frame.x)).toBeLessThan(3);
  expect(
    Math.abs(pinned.x + pinned.width - (frame.x + frame.width)),
  ).toBeLessThan(3);
  // Inside the margin a frame may cover, and above the name's tag.
  expect(hung.x + hung.width).toBeLessThan(box.x + box.width * 0.15);
  expect(pinned.x).toBeGreaterThan(box.x + box.width * 0.85);
  for (const column of [hung, pinned]) {
    expect(column.y + column.height).toBeLessThan(tag.y);
    expect(column.y).toBeGreaterThan(box.y);
  }
});

test("frames hang straight, side by side and never on each other", async ({
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
  const hide = (): Promise<string> =>
    style(frameOf(tileOf(page, "p1")), "background-image");

  await expect(page.locator("html")).toHaveClass(/mav-theme-hides/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    "/modules/modular-av-dock-hides/hides.css",
  );
  expect(await hide()).toContain("art/hide-");

  await page.evaluate(() =>
    window.harness?.client.game.settings.set(
      "modular-av-dock",
      "theme",
      "default",
    ),
  );

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect.poll(hide).toBe("none");
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
    "Hides (a barbarian's hall)",
  ]);
});

test("suggests a docked layout, where the dock is the wall, leaving the dock where it is", async ({
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
                  doc.documentElement.classList.contains("mav-theme-hides"),
                hide: getComputedStyle(frame).backgroundImage.includes(
                  "art/hide-",
                ),
              }
            : null;
        }, kind),
      )
      .toEqual({ themed: true, hide: true });
  });

test("the docked grid settles with frames that reach past the tiles", async ({
  page,
}) => {
  await page.goto(
    `/?module=${MODULES}&service=mock&sample=1&players=p1,p2&theme=hides`,
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
