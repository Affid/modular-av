// The scrolls theme's dock as a wizard's desk: dark wood under the
// scrolls, the header and the voice panel as papers, the buttons as cut
// stones, and glass, stone and metal where the cameras leave room.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { boxOf, dock, list, open, place, scatter, style } from "./page.ts";

test.use({ viewport: { width: 1280, height: 900 } });

/** The widths of the tile list's background layers, in pixels: the wand, then the things. */
async function deskLayers(page: Page): Promise<readonly number[]> {
  const sizes = await style(list(page), "background-size");
  return sizes.split(",").map((size) => parseFloat(size));
}

const papers = (page: Page): readonly Locator[] => [
  page.locator(".mav-dock-header"),
  page.locator(".mav-dock-panel"),
];

for (const placement of [
  "Docked on the left",
  "Docked on the right",
  "Docked at the top",
  "Docked at the bottom",
  "Floating",
] as const)
  test(`${placement}: the dock is a desk of dark wood that runs on at any size, with two papers on it`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement !== "Docked on the left")
      await place(page, new RegExp(`^${placement}`));

    expect(await style(dock(page), "background-image")).toContain(
      "art/desk.webp",
    );
    await expect(dock(page)).toHaveCSS("background-size", "600px 600px");
    await expect(dock(page)).toHaveCSS("background-repeat", "repeat");
    // Under the picture, a colour to read contrast from.
    expect(await style(dock(page), "background-color")).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    for (const paper of papers(page)) {
      expect(await style(paper, "border-image-source")).toContain(
        "art/paper.webp",
      );
      await expect(paper).toHaveCSS("border-image-slice", "96 fill");
      // Ink on vellum, and a colour under the picture for contrast.
      await expect(paper).toHaveCSS("color", "rgb(36, 26, 58)");
      expect(await style(paper, "background-color")).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
    }
  });

test("scattered there is no desk: the scrolls lie on the scene, and the panel is one paper", async ({
  page,
}) => {
  await open(page, 2);
  await scatter(page);

  await expect(dock(page)).toHaveCSS("background-image", "none");
  const [header, panel] = papers(page);
  if (!header || !panel) throw new Error("No papers");
  expect(await style(panel, "border-image-source")).toContain("art/paper.webp");
  // The header lies on the panel's paper: it is no sheet of its own.
  await expect(header).toHaveCSS("border-image-source", "none");
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("the buttons are cut stones: sapphire, emerald for a camera that is on, ruby for leaving", async ({
  page,
}) => {
  await open(page, 1);
  const button = (name: string): Locator =>
    page.locator(`.mav-dock-buttons .mav-dock-${name}`);

  for (const name of ["deafen", "settings", "leave"])
    expect(await style(button(name), "background-image"), name).toContain(
      "art/button.svg",
    );
  await expect(button("settings")).toHaveCSS(
    "background-color",
    "rgb(44, 58, 148)",
  );
  await expect(button("video")).toHaveCSS(
    "background-color",
    "rgb(28, 132, 85)",
  );
  await expect(button("leave")).toHaveCSS(
    "background-color",
    "rgb(161, 40, 40)",
  );
  // Each sign is cut in and filled with gold, small enough for the stone's flat top.
  await expect(button("settings")).toHaveCSS("color", "rgb(243, 213, 136)");
  await expect(button("settings").locator("i")).toHaveCSS("font-size", "12px");
  // The header's tools are stones too.
  expect(
    await style(
      page.locator(".mav-dock-tools .mav-dock-collapse"),
      "background-image",
    ),
  ).toContain("art/button.svg");
});

test("a button and its menu arrow are one stone, cut down the line between them", async ({
  page,
}) => {
  await open(page, 1);
  const [mic, arrow] = [
    page.locator(".mav-dock-buttons .mav-dock-mute"),
    page.locator(".mav-dock-mic-menu"),
  ];

  expect(await style(mic, "background-image")).toContain("art/button-left.svg");
  expect(await style(arrow, "background-image")).toContain(
    "art/button-right.svg",
  );
  // They meet with no gap and no line of border between them.
  const [left, right] = [await boxOf(mic), await boxOf(arrow)];
  expect(Math.abs(left.x + left.width - right.x)).toBeLessThan(0.5);
  await expect(mic).toHaveCSS("border-right-width", "0px");
  await expect(arrow).toHaveCSS("border-left-width", "0px");
  // The arrow's sign is smaller, and stays on its narrow flat top.
  await expect(arrow.locator("i")).toHaveCSS("font-size", "8px");
  const [sign, part] = [await boxOf(arrow.locator("i")), await boxOf(arrow)];
  expect(sign.x).toBeGreaterThanOrEqual(part.x);
  expect(sign.x + sign.width).toBeLessThanOrEqual(part.x + part.width - 3);

  // Muted, the whole stone is ruby: the arrow's part takes its button's colour.
  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await expect(arrow).toHaveCSS("background-color", "rgb(161, 40, 40)");
  await expect(page.locator(".mav-dock-camera-menu")).toHaveCSS(
    "background-color",
    "rgb(28, 132, 85)",
  );
});

test("collapsed at a side, where the arrows are put away, every button is a whole stone", async ({
  page,
}) => {
  await open(page, 1);

  await page.locator(".mav-dock-collapse").click();
  await expect(dock(page)).toHaveAttribute("data-collapsed", "");

  const mic = page.locator(".mav-dock-buttons .mav-dock-mute");
  await expect(page.locator(".mav-dock-mic-menu")).toBeHidden();
  expect(await style(mic, "background-image")).toContain("art/button.svg");
  await expect(mic).toHaveCSS("border-right-width", "1px");
  await expect(mic).toHaveCSS("border-top-right-radius", "7px");
});

test("glass, stone and metal lie where the cameras leave room, and a wand with a lot of it", async ({
  page,
}) => {
  // Nine cameras in a tall window leave room for the things; five fill the dock.
  await open(page, 4);
  await expect.poll(() => deskLayers(page)).toEqual([0, 0]);
  expect(await style(list(page), "background-image")).toMatch(
    /art\/wand\.webp.*art\/things\.webp/,
  );

  await open(page, 8);
  await expect.poll(() => deskLayers(page)).toEqual([0, 240]);

  // One camera large over four small ones leaves room for the wand too.
  await open(page, 4);
  await page.locator(".mav-dock-layout").click();
  await expect.poll(() => deskLayers(page)).toEqual([280, 240]);
  // They are painted on the list itself: nothing of them scrolls or takes clicks.
  expect(
    await list(page).evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBe(0);
});

test("upright the list scrolls down only; across the top it still scrolls sideways", async ({
  page,
}) => {
  await open(page, 8);
  await expect(list(page)).toHaveCSS("overflow-x", "hidden");

  await place(page, /^Docked at the top/);

  await expect(list(page)).toHaveCSS("overflow-x", "auto");
  await expect.poll(() => deskLayers(page)).toEqual([0, 0]);
});

test("on paper the focus ring and the states are dark enough to see", async ({
  page,
}) => {
  await open(page, 1);
  const token = (target: Locator, name: string): Promise<string> =>
    target.evaluate(
      (el, property) => getComputedStyle(el).getPropertyValue(property),
      name,
    );
  const [header] = papers(page);
  if (!header) throw new Error("No header");

  // On the dark desk and in menus, a light ring; on vellum, a dark one.
  expect(await token(dock(page), "--mav-focus")).toBe("#f3d36b");
  expect(await token(header, "--mav-focus")).toBe("#1b2a8a");
  const tool = page.locator(".mav-dock-tools .mav-dock-collapse");
  await tool.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(tool).toHaveCSS("outline-color", "rgb(27, 42, 138)");
});
