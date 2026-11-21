// The hides theme's dock as the wall of a hall: dark timber under the
// frames, the header and the voice panel as pieces of hide nailed to it,
// the buttons as the heads of iron nails, and a skull where the cameras
// leave room.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { boxOf, dock, list, open, place, scatter, style } from "./page.ts";

test.use({ viewport: { width: 1280, height: 900 } });

const CLEAR = "rgba(0, 0, 0, 0)";

/** How wide the skull is drawn on the tile list, in pixels: none where there is no room. */
const skullWidth = async (page: Page): Promise<number> =>
  parseFloat(await style(list(page), "background-size"));

const pieces = (page: Page): readonly Locator[] => [
  page.locator(".mav-dock-header"),
  page.locator(".mav-dock-panel"),
];

const button = (page: Page, name: string): Locator =>
  page.locator(`.mav-dock-buttons .mav-dock-${name}`);

for (const placement of [
  "Docked on the left",
  "Docked on the right",
  "Docked at the top",
  "Docked at the bottom",
  "Floating",
] as const)
  test(`${placement}: the dock is a wall of dark timber that runs on at any size, with two pieces of hide nailed to it`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement !== "Docked on the left")
      await place(page, new RegExp(`^${placement}`));

    expect(await style(dock(page), "background-image")).toContain(
      "art/wall.webp",
    );
    await expect(dock(page)).toHaveCSS("background-size", "600px 600px");
    await expect(dock(page)).toHaveCSS("background-repeat", "repeat");
    // Under the picture, a colour to read contrast from.
    expect(await style(dock(page), "background-color")).not.toBe(CLEAR);
    for (const piece of pieces(page)) {
      // Its edges and nails, cut in nine and repeated along a long side: a stretch smears leather.
      expect(await style(piece, "border-image-source")).toContain(
        "art/piece.webp",
      );
      await expect(piece).toHaveCSS("border-image-slice", "48");
      await expect(piece).toHaveCSS("border-image-repeat", "round");
      // The hide itself under them, one repeat each way.
      expect(await style(piece, "background-image")).toContain(
        "art/leather.webp",
      );
      await expect(piece).toHaveCSS("background-size", "300px 300px");
      // Dark on pale hide, and a colour under the picture for contrast.
      await expect(piece).toHaveCSS("color", "rgb(42, 20, 8)");
      expect(await style(piece, "background-color")).not.toBe(CLEAR);
    }
  });

test("scattered there is no wall: the frames hang over the scene, and the panel is one piece of hide", async ({
  page,
}) => {
  await open(page, 2);
  await scatter(page);

  await expect(dock(page)).toHaveCSS("background-image", "none");
  const [header, panel] = pieces(page);
  if (!header || !panel) throw new Error("No pieces");
  expect(await style(panel, "border-image-source")).toContain("art/piece.webp");
  // The header lies on the panel's hide: it is no piece of its own.
  await expect(header).toHaveCSS("border-image-source", "none");
  await expect(header).toHaveCSS("background-image", "none");
});

test("the buttons are iron nail heads: iron at rest, green paint for a camera that is on, red for leaving", async ({
  page,
}) => {
  await open(page, 1);

  for (const name of ["deafen", "settings", "leave"]) {
    expect(await style(button(page, name), "background-image"), name).toContain(
      "art/stud.webp",
    );
    // Light and shade over the button's own colour, whatever that is.
    await expect(button(page, name)).toHaveCSS(
      "background-blend-mode",
      "hard-light",
    );
  }
  await expect(button(page, "settings")).toHaveCSS(
    "background-color",
    "rgb(74, 71, 68)",
  );
  await expect(button(page, "video")).toHaveCSS(
    "background-color",
    "rgb(47, 125, 79)",
  );
  await expect(button(page, "leave")).toHaveCSS(
    "background-color",
    "rgb(161, 40, 40)",
  );
  // The header's tools are nail heads too.
  expect(
    await style(
      page.locator(".mav-dock-tools .mav-dock-collapse"),
      "background-image",
    ),
  ).toContain("art/stud.webp");
});

test("a button and its menu arrow are one longer head in two parts, and a pressed button's paint runs over both", async ({
  page,
}) => {
  await open(page, 1);
  const mic = button(page, "mute");
  const arrow = page.locator(".mav-dock-buttons .mav-dock-mic-menu");

  expect(await style(mic, "background-image")).toContain("art/stud-left.webp");
  expect(await style(arrow, "background-image")).toContain(
    "art/stud-right.webp",
  );
  // No line and no gap between them.
  await expect(mic).toHaveCSS("border-right-width", "0px");
  await expect(arrow).toHaveCSS("border-left-width", "0px");
  const [left, right] = [await boxOf(mic), await boxOf(arrow)];
  expect(Math.abs(left.x + left.width - right.x)).toBeLessThan(0.5);
  // The chevron stands in the middle of its part, smaller than the dock's own so that it is clear of the edge.
  const chevron = arrow.locator("i");
  expect(Math.abs((await boxOf(chevron)).middle - right.middle)).toBeLessThan(
    1,
  );
  await expect(chevron).toHaveCSS("font-size", "9px");

  await mic.click();

  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await expect(arrow).toHaveCSS("background-color", "rgb(161, 40, 40)");
  await expect(mic).toHaveCSS("background-color", "rgb(161, 40, 40)");
});

for (const side of ["left", "right"] as const)
  test(`collapsed on the ${side}, where the arrows are put away, every button is a whole head inside its piece of hide`, async ({
    page,
  }) => {
    await open(page, 1);
    if (side === "right") await place(page, /^Docked on the right/);

    await page.locator(".mav-dock-collapse").click();
    await expect(dock(page)).toHaveAttribute("data-collapsed", "");

    const mic = button(page, "mute");
    await expect(page.locator(".mav-dock-mic-menu")).toBeHidden();
    expect(await style(mic, "background-image")).toContain("art/stud.webp");
    await expect(mic).toHaveCSS("border-right-width", "1px");
    await expect(mic).toHaveCSS("border-top-right-radius", "6px");
    // Nothing of a button is cut off: each lies inside the panel and the rail.
    const [rail, panel] = [
      await boxOf(dock(page)),
      await boxOf(page.locator(".mav-dock-panel")),
    ];
    for (const name of ["mute", "video", "leave"]) {
      const head = await boxOf(button(page, name));
      expect(head.x, name).toBeGreaterThanOrEqual(panel.x);
      expect(head.x + head.width, name).toBeLessThanOrEqual(
        panel.x + panel.width,
      );
      expect(Math.abs(head.middle - rail.middle), name).toBeLessThan(1.5);
    }
  });

test("a horned skull hangs on the wall where the cameras leave room, and nowhere else", async ({
  page,
}) => {
  // Five cameras fill the dock; nine, two abreast, leave room under them.
  await open(page, 4);
  await expect.poll(() => skullWidth(page)).toBe(0);
  expect(await style(list(page), "background-image")).toContain(
    "art/skull.webp",
  );

  await open(page, 8);
  await expect.poll(() => skullWidth(page)).toBe(240);
  await expect(list(page)).toHaveCSS("background-size", "240px 160px");
  // It is painted on the list itself: nothing of it scrolls or takes clicks.
  expect(
    await list(page).evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBe(0);
  // Its foot is clear of the panel below, and its horns of the frames above.
  const spare = Number(
    await list(page).evaluate((el) =>
      el.style.getPropertyValue("--mav-dock-spare"),
    ),
  );
  expect(spare).toBeGreaterThanOrEqual(164);
});

test("upright the list scrolls down only; across the top it still scrolls sideways, and no skull hangs there", async ({
  page,
}) => {
  await open(page, 8);
  await expect(list(page)).toHaveCSS("overflow-x", "hidden");

  await place(page, /^Docked at the top/);

  await expect(list(page)).toHaveCSS("overflow-x", "auto");
  await expect.poll(() => skullWidth(page)).toBe(0);
});

test("on pale hide the focus ring and the states are dark enough to see", async ({
  page,
}) => {
  await open(page, 1);
  const token = (target: Locator, name: string): Promise<string> =>
    target.evaluate(
      (el, property) => getComputedStyle(el).getPropertyValue(property),
      name,
    );
  const [header] = pieces(page);
  if (!header) throw new Error("No header");

  // On the dark wall and in menus, a light ring; on hide, a dark one.
  expect(await token(dock(page), "--mav-focus")).toBe("#ffd98a");
  expect(await token(header, "--mav-focus")).toBe("#3a1c00");
  expect(await token(header, "--mav-muted")).toBe("#9a1418");
  const tool = page.locator(".mav-dock-tools .mav-dock-collapse");
  await tool.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(tool).toHaveCSS("outline-color", "rgb(58, 28, 0)");
});
