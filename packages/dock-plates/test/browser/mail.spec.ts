// The plates theme's dock as the fighter's harness: mail over blue cloth
// under the plates, the header and the voice panel as larger plates, the
// buttons as small ones, and one of the fighter's things where the cameras
// leave room.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { boxOf, dock, list, open, place, scatter, style } from "./page.ts";

test.use({ viewport: { width: 1280, height: 900 } });

const CLEAR = "rgba(0, 0, 0, 0)";
/** The things in the free room, in the order the stylesheet lays them. */
const THINGS = ["buckler", "gauntlets", "mace"] as const;

/** How wide each thing is drawn on the tile list, in pixels: none where there is no room for it. */
const thingWidths = async (
  page: Page,
): Promise<Readonly<Record<(typeof THINGS)[number], number>>> => {
  const sizes = (await style(list(page), "background-size")).split(", ");
  const widths = sizes.map((size) => parseFloat(size));
  return {
    buckler: widths[0] ?? NaN,
    gauntlets: widths[1] ?? NaN,
    mace: widths[2] ?? NaN,
  };
};

/** What the dock says of the room under the cameras; empty until it has measured. */
const spareOf = (page: Page): Promise<string> =>
  list(page).evaluate((el) => el.style.getPropertyValue("--mav-dock-spare"));

const plates = (page: Page): readonly Locator[] => [
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
  test(`${placement}: the dock is mail over blue cloth that runs on at any size, with two larger plates on it`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement !== "Docked on the left")
      await place(page, new RegExp(`^${placement}`));

    expect(await style(dock(page), "background-image")).toContain(
      "art/mail.webp",
    );
    await expect(dock(page)).toHaveCSS("background-size", "300px 300px");
    await expect(dock(page)).toHaveCSS("background-repeat", "repeat");
    // Under the picture, a colour to read contrast from.
    expect(await style(dock(page), "background-color")).not.toBe(CLEAR);
    for (const plate of plates(page)) {
      // Its rolled edge and rivets, cut in nine and repeated along a long side: a stretch smears steel.
      expect(await style(plate, "border-image-source")).toContain(
        "art/lame.webp",
      );
      await expect(plate).toHaveCSS("border-image-slice", "60");
      await expect(plate).toHaveCSS("border-image-repeat", "round");
      // The steel itself under them, one repeat each way.
      expect(await style(plate, "background-image")).toContain(
        "art/steel.webp",
      );
      await expect(plate).toHaveCSS("background-size", "300px 300px");
      // Light on dark steel, and a colour under the picture for contrast.
      await expect(plate).toHaveCSS("color", "rgb(233, 231, 226)");
      expect(await style(plate, "background-color")).not.toBe(CLEAR);
    }
  });

test("scattered there is no mail: the plates lie over the scene, and the panel is one larger plate", async ({
  page,
}) => {
  await open(page, 2);
  await scatter(page);

  await expect(dock(page)).toHaveCSS("background-image", "none");
  const [header, panel] = plates(page);
  if (!header || !panel) throw new Error("No plates");
  expect(await style(panel, "border-image-source")).toContain("art/lame.webp");
  // The header lies on the panel's plate: it is no plate of its own.
  await expect(header).toHaveCSS("border-image-source", "none");
  await expect(header).toHaveCSS("background-image", "none");
});

test("the buttons are small plates: dark steel at rest, blued for a camera that is on, red paint for leaving", async ({
  page,
}) => {
  await open(page, 1);

  for (const name of ["deafen", "settings", "leave"]) {
    expect(await style(button(page, name), "background-image"), name).toMatch(
      /art\/tab-[12]\.webp/,
    );
    // Light and shade over the button's own colour, whatever that is.
    await expect(button(page, name)).toHaveCSS(
      "background-blend-mode",
      "hard-light",
    );
  }
  await expect(button(page, "settings")).toHaveCSS(
    "background-color",
    "rgb(63, 68, 74)",
  );
  await expect(button(page, "video")).toHaveCSS(
    "background-color",
    "rgb(45, 95, 158)",
  );
  await expect(button(page, "leave")).toHaveCSS(
    "background-color",
    "rgb(161, 40, 40)",
  );
  // The header's tools are plates too.
  expect(
    await style(
      page.locator(".mav-dock-tools .mav-dock-collapse"),
      "background-image",
    ),
  ).toMatch(/art\/tab-[12]\.webp/);
});

test("a button and its menu arrow are one longer plate in two parts, and a pressed button's paint runs over both", async ({
  page,
}) => {
  await open(page, 1);
  const mic = button(page, "mute");
  const arrow = page.locator(".mav-dock-buttons .mav-dock-mic-menu");

  expect(await style(mic, "background-image")).toContain("art/tab-left.webp");
  expect(await style(arrow, "background-image")).toContain(
    "art/tab-right.webp",
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
  await expect(mic).toHaveCSS("background-color", "rgb(161, 40, 40)");
  await expect(arrow).toHaveCSS("background-color", "rgb(161, 40, 40)");
});

for (const side of ["left", "right"] as const)
  test(`collapsed on the ${side}, where the arrows are put away, every button is a whole plate inside its larger one`, async ({
    page,
  }) => {
    await open(page, 1);
    if (side === "right") await place(page, /^Docked on the right/);

    await page.locator(".mav-dock-collapse").click();
    await expect(dock(page)).toHaveAttribute("data-collapsed", "");

    const mic = button(page, "mute");
    await expect(page.locator(".mav-dock-mic-menu")).toBeHidden();
    expect(await style(mic, "background-image")).toContain("art/tab-1.webp");
    await expect(mic).toHaveCSS("border-right-width", "1px");
    await expect(mic).toHaveCSS("border-top-right-radius", "3px");
    // Nothing of a button is cut off: each lies inside the panel and the rail.
    const [rail, panel] = [
      await boxOf(dock(page)),
      await boxOf(page.locator(".mav-dock-panel")),
    ];
    for (const name of ["mute", "video", "leave"]) {
      const plate = await boxOf(button(page, name));
      expect(plate.x, name).toBeGreaterThanOrEqual(panel.x);
      expect(plate.x + plate.width, name).toBeLessThanOrEqual(
        panel.x + panel.width,
      );
      expect(Math.abs(plate.middle - rail.middle), name).toBeLessThan(1.5);
    }
  });

test("one of the fighter's things hangs where the cameras leave room: the tallest that fits whole, and none where nothing fits", async ({
  page,
}) => {
  // Five cameras fill the dock: no room, nothing.
  await open(page, 4);
  // Once the dock has said how much room is left: before that there is nothing either way.
  await expect.poll(() => spareOf(page)).not.toBe("");
  expect(Number(await spareOf(page))).toBeLessThan(88);
  await expect
    .poll(() => thingWidths(page))
    .toEqual({ buckler: 0, gauntlets: 0, mace: 0 });
  for (const name of THINGS)
    expect(await style(list(page), "background-image")).toContain(
      `art/${name}.webp`,
    );

  // Three cameras leave a low room: the mace, lying across.
  await open(page, 2);
  await expect
    .poll(() => thingWidths(page))
    .toEqual({ buckler: 0, gauntlets: 0, mace: 260 });
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(88);
  expect(Number(await spareOf(page))).toBeLessThan(184);

  // Nine, two abreast, leave more: the gauntlets, and the mace is gone.
  await open(page, 8);
  await expect
    .poll(() => thingWidths(page))
    .toEqual({ buckler: 0, gauntlets: 170, mace: 0 });
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(184);
  expect(Number(await spareOf(page))).toBeLessThan(240);

  // In a taller window there is room for the buckler, alone.
  await page.setViewportSize({ width: 1280, height: 1080 });
  await expect
    .poll(() => thingWidths(page))
    .toEqual({ buckler: 190, gauntlets: 0, mace: 0 });
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(240);
  await expect(list(page)).toHaveCSS(
    "background-size",
    "190px 236px, 0px 180px, 0px 84px",
  );
  // They are painted on the list itself: nothing of them scrolls.
  expect(
    await list(page).evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBe(0);
});

test("upright the list scrolls down only; across the top it still scrolls sideways, and nothing hangs there", async ({
  page,
}) => {
  await open(page, 8);
  await expect(list(page)).toHaveCSS("overflow-x", "hidden");

  await place(page, /^Docked at the top/);

  await expect(list(page)).toHaveCSS("overflow-x", "auto");
  // The mail is still there, and the dock says no room is left under a row.
  expect(await style(dock(page), "background-image")).toContain(
    "art/mail.webp",
  );
  await expect.poll(() => spareOf(page)).toBe("0");
  await expect
    .poll(() => thingWidths(page))
    .toEqual({ buckler: 0, gauntlets: 0, mace: 0 });
});
