// The vines theme's dock as one plant: a trunk down its free edge with
// boughs that hold the header and the voice panel, names on plates that
// hang under the cameras, and loose ends and a branch in the room under them.
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });

async function open(page: Page, players: number): Promise<void> {
  const ids = Array.from({ length: players }, (_, i) => `p${String(i + 1)}`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    `/?module=dock,dock-vines&service=mock&players=${ids.join(",")}&theme=vines`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile[data-connected]")).toHaveCount(
    players + 1,
    { timeout: 30_000 },
  );
  // The harness's page has no height of its own: a docked dock would grow.
  await page.addStyleTag({ content: "#camera-views { height: 100vh }" });
  await expect(page.locator("html")).toHaveClass(/mav-theme-vines/);
}

async function place(page: Page, placement: RegExp): Promise<void> {
  await page.locator(".mav-dock-placement").click();
  await page.getByRole("menuitemradio", { name: placement }).click();
}

type Pseudo = "::before" | "::after";

/** Styles of an element's pseudo-element, by property. */
const styleOf = (
  target: Locator,
  pseudo: Pseudo,
  properties: readonly string[],
): Promise<Record<string, string>> =>
  target.evaluate(
    (el, [which, names]) => {
      const style = getComputedStyle(el, which);
      return Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name)]),
      );
    },
    [pseudo, properties] as const,
  );

/** The widths of a pseudo-element's background layers, in pixels. */
async function layerWidths(
  target: Locator,
  pseudo: Pseudo,
): Promise<readonly number[]> {
  const { "background-size": sizes = "" } = await styleOf(target, pseudo, [
    "background-size",
  ]);
  return sizes.split(",").map((size) => parseFloat(size));
}

const dock = (page: Page): Locator => page.locator(".mav-dock");
const list = (page: Page): Locator => page.locator(".mav-dock-tiles");

test("docked, a trunk runs down the dock's free edge, over nothing that takes clicks", async ({
  page,
}) => {
  await open(page, 2);

  const trunk = await styleOf(dock(page), "::after", [
    "background-image",
    "background-repeat",
    "width",
    "pointer-events",
    "z-index",
  ]);

  expect(trunk["background-image"]).toContain("frames/trunk.svg");
  expect(trunk["background-repeat"]).toBe("repeat-y");
  expect(trunk.width).toBe("40px");
  expect(trunk["pointer-events"]).toBe("none");
  // The dock's ground stops under it: the edge toward the scene is the trunk's.
  await expect(dock(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(
    await dock(page).evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain("linear-gradient");
  // The grip that resizes the dock is over the trunk, and still takes the pointer.
  const edge = page.locator(".mav-dock-edge");
  expect(
    Number(await edge.evaluate((el) => getComputedStyle(el).zIndex)),
  ).toBeGreaterThan(Number(trunk["z-index"]));
  const box = await edge.boundingBox();
  if (!box) throw new Error("No edge");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".mav-dock-edge-grip")).toHaveCSS("opacity", "1");
});

test("four boughs off the trunk hold the header and the voice panel, as wide as the dock", async ({
  page,
}) => {
  await open(page, 2);
  const boards = [
    [".mav-dock-header", "::before", "bough-top"],
    [".mav-dock-header", "::after", "bough-header"],
    [".mav-dock-panel", "::before", "bough-panel"],
    [".mav-dock-panel", "::after", "bough-foot"],
  ] as const;
  const dockBox = await dock(page).boundingBox();
  if (!dockBox) throw new Error("No dock");

  for (const [selector, pseudo, name] of boards) {
    const board = page.locator(selector);
    const bough = await styleOf(board, pseudo, [
      "border-image-source",
      "border-image-repeat",
      "pointer-events",
      "width",
      "height",
    ]);

    expect(bough["border-image-source"], name).toContain(`frames/${name}.svg`);
    expect(bough["border-image-repeat"], name).toBe("round");
    expect(bough["pointer-events"], name).toBe("none");
    // From 2px inside the dock's edge to the trunk's centre line, 12px inside the other.
    const wide =
      parseFloat(bough.width ?? "") +
      (await board.evaluate((el, which) => {
        const style = getComputedStyle(el, which);
        return (
          parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
        );
      }, pseudo));
    expect(Math.abs(wide - (dockBox.width - 14)), name).toBeLessThanOrEqual(2);
  }
  // Both are boards: the header has the panel's surface.
  const surfaces = await Promise.all(
    [".mav-dock-header", ".mav-dock-panel"].map((selector) =>
      page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ),
  );
  expect(surfaces[0]).toBe(surfaces[1]);
  expect(surfaces[0]).not.toBe("rgba(0, 0, 0, 0)");
});

for (const layout of ["docked", "scattered"] as const)
  test(`${layout}, each name hangs on a plate under its camera, clear of the picture`, async ({
    page,
  }) => {
    await open(page, 2);
    if (layout === "scattered") {
      await place(page, /Scattered over the screen/);
      await expect(
        page.locator(".mav-dock-tile[data-anchor]").first(),
      ).toBeVisible();
    }

    for (const tile of await page.locator(".mav-dock-tile").all()) {
      const [box, name] = [
        await tile.boundingBox(),
        await tile.locator(".mav-dock-tile-name").boundingBox(),
      ];
      if (!box || !name) throw new Error("Not on screen");

      // Under the tile, within the room the theme asks the dock to keep, and centred.
      expect(name.y).toBeGreaterThanOrEqual(box.y + box.height);
      const room = layout === "scattered" ? 0.19 : 0.128;
      const spare = layout === "scattered" ? 0 : 14;
      expect(name.y + name.height).toBeLessThanOrEqual(
        box.y + box.height + room * box.width + spare,
      );
      expect(
        Math.abs(name.x + name.width / 2 - (box.x + box.width / 2)),
      ).toBeLessThan(box.width * 0.2);
    }
    const name = page.locator(".mav-dock-tile-name").first();
    await expect(name).toHaveCSS("font-family", /Modesto Condensed/);
    expect(
      await name.evaluate((el) => getComputedStyle(el).borderImageSource),
    ).toContain("frames/plate.svg");
    // Hung by two loops of withy.
    for (const pseudo of ["::before", "::after"] as const)
      expect(
        (await styleOf(name, pseudo, ["background-image"]))["background-image"],
      ).toContain("frames/loop.svg");
  });

test("a long name is cut short on its plate, not let out of it", async ({
  page,
}) => {
  await open(page, 8);
  const tile = page.locator(".mav-dock-tile").first();
  const name = tile.locator(".mav-dock-tile-name");

  const [box, plate] = [await tile.boundingBox(), await name.boundingBox()];

  expect(plate?.width).toBeLessThanOrEqual(box?.width ?? 0);
  await expect(name).toHaveCSS("text-overflow", "ellipsis");
  await expect(name).toHaveCSS("white-space", "nowrap");
});

test("the player's own level is a shoot along the bottom branch", async ({
  page,
}) => {
  await open(page, 1);
  const meter = page.locator(".mav-dock-tile .mav-meter");

  await expect(meter).toHaveCount(1);
  expect(
    await meter.evaluate((el) => getComputedStyle(el).maskImage),
  ).toContain("frames/meter.svg");
  await expect(meter).toHaveCSS("mask-repeat", "repeat-x");
});

test("loose ends hang under the last camera of a column, and only there", async ({
  page,
}) => {
  await open(page, 1);
  const [first, last] = await page.locator(".mav-dock-tile").all();
  if (!first || !last) throw new Error("No tiles");

  // The layers: long loose ends, short ones, tied only.
  await expect
    .poll(async () => (await layerWidths(last, "::before"))[0])
    .toBeGreaterThan(0);
  expect((await layerWidths(last, "::before")).slice(1)).toEqual([0, 0]);
  const tied = await layerWidths(first, "::before");
  expect(tied.slice(0, 2)).toEqual([0, 0]);
  expect(tied[2]).toBeGreaterThan(0);
  // Nothing that hangs there makes the list scroll.
  const scroll = await list(page).evaluate(
    (el) => el.scrollHeight - el.clientHeight,
  );
  expect(scroll).toBeLessThanOrEqual(0);
});

test("a full dock has no loose ends and no branch, and doesn't scroll for them", async ({
  page,
}) => {
  await open(page, 4);

  await expect
    .poll(() =>
      list(page).evaluate((el) =>
        el.style.getPropertyValue("--mav-dock-spare"),
      ),
    )
    .not.toBe("");
  const spare = Number(
    await list(page).evaluate((el) =>
      el.style.getPropertyValue("--mav-dock-spare"),
    ),
  );
  expect(spare).toBeLessThan(85);

  for (const tile of await page.locator(".mav-dock-tile").all())
    expect((await layerWidths(tile, "::before")).slice(0, 2)).toEqual([0, 0]);
  expect(await layerWidths(list(page), "::after")).toEqual([0, 0, 0]);
  const scroll = await list(page).evaluate((el) => ({
    down: el.scrollHeight - el.clientHeight,
    across: getComputedStyle(el).overflowX,
  }));
  expect(scroll.down).toBeLessThanOrEqual(0);
  expect(scroll.across).toBe("hidden");
});

for (const [players, height, shown] of [
  [1, 1000, [275, 0, 0]],
  [1, 900, [0, 275, 0]],
  [1, 700, [0, 0, 210]],
] as const)
  test(`a branch grows into the room under ${String(players + 1)} cameras in a window ${String(height)} high: ${shown.join(", ")}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height });
    await open(page, players);

    // Large, medium, small: only the one there is room for has a width.
    await expect.poll(() => layerWidths(list(page), "::after")).toEqual(shown);
    const branch = await styleOf(list(page), "::after", [
      "background-image",
      "z-index",
      "pointer-events",
    ]);
    expect(branch["background-image"]).toMatch(
      /branch-large\.svg.*branch-medium\.svg.*branch-small\.svg/,
    );
    expect(branch["z-index"]).toBe("-1");
    expect(branch["pointer-events"]).toBe("none");
  });

test("docked on the right, the plant is the other way round", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /Docked on the right/);

  await expect
    .poll(
      async () =>
        (await styleOf(dock(page), "::after", ["transform"])).transform,
    )
    .toBe("matrix(-1, 0, 0, 1, 0, 0)");
  const trunk = await styleOf(dock(page), "::after", ["left", "right"]);
  expect(trunk.left).toBe("0px");
  expect(trunk.right).not.toBe("0px");
  expect(
    (await styleOf(page.locator(".mav-dock-header"), "::after", ["transform"]))
      .transform,
  ).toBe("matrix(-1, 0, 0, 1, 0, 0)");
});

test("docked at the top, the trunk runs across and the cameras hang under it", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /Docked at the top/);

  await expect
    .poll(
      async () =>
        (await styleOf(dock(page), "::after", ["background-image"]))[
          "background-image"
        ],
    )
    .toContain("frames/trunk-across.svg");
  const trunk = await styleOf(dock(page), "::after", [
    "background-repeat",
    "height",
  ]);
  expect(trunk["background-repeat"]).toBe("repeat-x");
  expect(trunk.height).toBe("40px");
  // No boughs here: the header and the panel are the dock's side columns.
  expect(
    (await styleOf(page.locator(".mav-dock-header"), "::after", ["content"]))
      .content,
  ).toBe("none");
  // The cameras still hang, each on its lianas, with its name under it.
  const tile = page.locator(".mav-dock-tile").first();
  expect(
    (await styleOf(tile, "::before", ["background-image"]))["background-image"],
  ).toContain("frames/hang-");
  // Nothing of the theme makes the strip scroll.
  const scroll = await list(page).evaluate(
    (el) => el.scrollWidth - el.clientWidth,
  );
  expect(scroll).toBeLessThanOrEqual(0);
});

test("floating, the dock is the same plant, with no box drawn round it", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /^Floating/);

  await expect
    .poll(
      async () =>
        (await styleOf(dock(page), "::after", ["background-image"]))[
          "background-image"
        ],
    )
    .toContain("frames/trunk.svg");
  await expect(dock(page)).toHaveCSS("box-shadow", "none");
  await expect(dock(page)).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  // Its own resize grip stays over the trunk.
  expect(
    Number(
      await page
        .locator(".mav-dock-resize")
        .evaluate((el) => getComputedStyle(el).zIndex),
    ),
  ).toBeGreaterThan(1);
});

for (const placement of ["on the left", "at the top"] as const)
  test(`collapsed ${placement}, the dock has no room for the plant: it is plain`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement === "at the top") await place(page, /Docked at the top/);
    await page.locator(".mav-dock-collapse").click();
    await expect(dock(page)).toHaveAttribute("data-collapsed", "");

    expect((await styleOf(dock(page), "::after", ["content"])).content).toBe(
      "none",
    );
    expect(
      (await styleOf(page.locator(".mav-dock-header"), "::before", ["content"]))
        .content,
    ).toBe("none");
    await expect(dock(page)).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });
