// The mirror itself: the dock as one pane of black glass in old silver,
// its header and panel, its buttons in silver bezels, and what the empty
// glass under the cameras shows.
import { expect, type Locator, test } from "@playwright/test";
import {
  boxOf,
  button,
  dock,
  list,
  open,
  place,
  scatter,
  spareOf,
  style,
  tileOf,
} from "./page.ts";

test.use({ viewport: { width: 1280, height: 900 } });

/**
 * The silver of the arrow's bezel (art/btn-r.webp, read off its pixels):
 * the parting bar takes 1.5 CSS pixels of the part's left, the bezel 4 of
 * its right. Between them is the glass the chevron must sit in.
 */
const ARROW_SILVER = { left: 1.5, right: 4 };
/** How much glass a chevron keeps clear on each side, at the least. */
const CHEVRON_CLEAR = 3;
/** Pixels to a CSS pixel in the pictures the chevron's ink is read from. */
const ZOOM = 8;

/**
 * Where the chevron's ink is across its part, in CSS pixels from the
 * part's left: read off a picture of the part (taken at ZOOM pixels to
 * one), since the icon's box is wider than the glyph it draws. The ink is
 * the near white of the icon in the middle half of the part's height.
 */
async function inkOf(
  arrow: Locator,
): Promise<{ width: number; inkLeft: number; inkRight: number }> {
  const box = await boxOf(arrow);
  const png = await arrow.screenshot({ scale: "device" });
  const ink = await arrow.page().evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const {
      data: px,
      width,
      height,
    } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = width;
    let right = -1;
    for (let y = Math.floor(height / 4); y < (3 * height) / 4; y += 1)
      for (let x = 0; x < width; x += 1) {
        const k = (y * width + x) * 4;
        const lum =
          (0.2126 * (px[k] ?? 0) +
            0.7152 * (px[k + 1] ?? 0) +
            0.0722 * (px[k + 2] ?? 0)) /
          255;
        if (lum > 0.55) {
          left = Math.min(left, x);
          right = Math.max(right, x + 1);
        }
      }
    return right < 0 ? null : { left, right, width };
  }, png.toString("base64"));
  if (!ink) throw new Error("No chevron drawn in the arrow");
  const scale = ink.width / box.width;
  return {
    width: box.width,
    inkLeft: ink.left / scale,
    inkRight: ink.right / scale,
  };
}

for (const placement of [
  "Docked on the left",
  "Docked at the top",
  "Floating",
] as const)
  test(`${placement}: the dock is black glass that repeats at any size, in a frame of old silver`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement !== "Docked on the left")
      await place(page, new RegExp(`^${placement}`));
    const mirror = dock(page);

    expect(await style(mirror, "border-image-source")).toContain(
      "art/dockframe.webp",
    );
    await expect(mirror).toHaveCSS("border-top-width", "8px");
    const ground = await style(mirror, "background-image");
    expect(ground).toContain("art/glass.webp");
    expect(await style(mirror, "background-size")).toContain("300px 300px");
    // The header and the panel are panes of the same glass, parted from the cameras' by a silver transom.
    const transom =
      placement === "Docked at the top" ? "transom-v" : "transom-h";
    expect(
      await style(
        page.locator(".mav-dock-header"),
        "background-image",
        "::after",
      ),
    ).toContain(`art/${transom}.webp`);
    expect(
      await style(
        page.locator(".mav-dock-panel"),
        "background-image",
        "::before",
      ),
    ).toContain(`art/${transom}.webp`);
  });

test("scattered there is no mirror round the dock: each camera carries a pane of it, and the header and panel are small mirrors", async ({
  page,
}) => {
  await open(page, 1);
  await scatter(page);

  expect(await style(dock(page), "border-image-source")).toBe("none");
  const pane = tileOf(page, "p1");
  expect(await style(pane, "background-image", "::after")).toContain(
    "art/pane.webp",
  );
  expect(await style(pane, "mask-image", "::before")).toContain(
    "art/pane.webp",
  );
  // The header lies in the panel there: one small mirror for both.
  expect(
    await style(page.locator(".mav-dock-panel"), "border-image-source"),
  ).toContain("art/dockframe.webp");
});

test("the buttons are panes of glass in silver bezels: an ember for muted, the patron's light for a camera that is on", async ({
  page,
}) => {
  await open(page, 1);
  const mic = button(page, "mute");
  const camera = button(page, "video");
  const leave = button(page, "leave");

  expect(await style(button(page, "deafen"), "background-image")).toContain(
    "art/btn.webp",
  );
  expect(await style(mic, "background-image")).toContain("art/btn-l.webp");
  // The camera is on: its glass is lit violet from behind.
  await expect(camera).toHaveAttribute("aria-pressed", "true");
  await expect(camera).toHaveCSS("background-color", "rgb(13, 8, 22)");
  // Leaving is dark glass with an ember icon at rest.
  await expect(leave).toHaveCSS("background-color", "rgb(11, 10, 15)");
  await expect(leave).toHaveCSS("color", "rgb(240, 122, 94)");

  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await expect(mic).toHaveCSS("background-color", "rgb(18, 3, 5)");
  await expect(page.locator(".mav-dock-buttons .mav-dock-mic-menu")).toHaveCSS(
    "background-color",
    "rgb(18, 3, 5)",
  );
});

test.describe("drawn at eight pixels to one", () => {
  test.use({ deviceScaleFactor: ZOOM });

  for (const where of ["in the panel", "at the top, put away"] as const)
    test(`a menu arrow's chevron sits in the middle of its glass, clear of the silver on both sides, ${where}`, async ({
      page,
    }) => {
      await open(page, 1);
      if (where !== "in the panel") {
        await place(page, /^Docked at the top/);
        await page.locator(".mav-dock-collapse").click();
        await expect(dock(page)).toHaveAttribute("data-collapsed", "");
      }
      for (const which of ["mic", "camera"]) {
        const arrow = page.locator(`.mav-dock-buttons .mav-dock-${which}-menu`);
        expect(await style(arrow, "background-image")).toContain(
          "art/btn-r.webp",
        );
        const states = ["at rest", "under the pointer"] as const;
        for (const state of states) {
          if (state === "under the pointer") await arrow.hover();
          const { width, inkLeft, inkRight } = await inkOf(arrow);
          const left = inkLeft - ARROW_SILVER.left;
          const right = width - ARROW_SILVER.right - inkRight;

          expect(
            left,
            `${which} ${state}: glass left of the chevron`,
          ).toBeGreaterThanOrEqual(CHEVRON_CLEAR);
          expect(
            right,
            `${which} ${state}: glass right of it`,
          ).toBeGreaterThanOrEqual(CHEVRON_CLEAR);
          expect(
            Math.abs(left - right),
            `${which} ${state}: centred`,
          ).toBeLessThan(1);
        }
      }
      // Pressed, the ember lies behind the same glass: the chevron stays where it was.
      const mute = button(page, "mute");
      await mute.click();
      await expect(mute).toHaveAttribute("aria-pressed", "true");
      const pressed = await inkOf(
        page.locator(".mav-dock-buttons .mav-dock-mic-menu"),
      );
      expect(pressed.inkLeft - ARROW_SILVER.left).toBeGreaterThanOrEqual(
        CHEVRON_CLEAR,
      );
      expect(
        pressed.width - ARROW_SILVER.right - pressed.inkRight,
      ).toBeGreaterThanOrEqual(CHEVRON_CLEAR);
    });
});

for (const side of ["left", "right"] as const)
  test(`collapsed on the ${side}, the arrows put away, every button is a whole bezel in the rail`, async ({
    page,
  }) => {
    await open(page, 1);
    if (side === "right") await place(page, /^Docked on the right/);

    await page.locator(".mav-dock-collapse").click();
    await expect(dock(page)).toHaveAttribute("data-collapsed", "");

    const mic = button(page, "mute");
    await expect(page.locator(".mav-dock-mic-menu")).toBeHidden();
    expect(await style(mic, "background-image")).toContain("art/btn.webp");
    await expect(mic).toHaveCSS("border-top-right-radius", "4px");
    const [rail, panel] = [
      await boxOf(dock(page)),
      await boxOf(page.locator(".mav-dock-panel")),
    ];
    for (const name of ["mute", "video", "leave"]) {
      const bezel = await boxOf(button(page, name));
      expect(bezel.x, name).toBeGreaterThanOrEqual(panel.x);
      expect(bezel.x + bezel.width, name).toBeLessThanOrEqual(
        panel.x + panel.width,
      );
      expect(Math.abs(bezel.middle - rail.middle), name).toBeLessThan(1.5);
    }
  });

/** The widths the contract and the quill are drawn at under the cameras. */
const fillWidths = async (
  page: Parameters<typeof list>[0],
): Promise<{ quill: number; contract: number }> => {
  const [quill = 0, contract = 0] = (await style(list(page), "background-size"))
    .split(",")
    .map((size) => Number.parseFloat(size));
  return { quill, contract };
};

test("the empty glass under the cameras: a hand holds up a contract from 90 pixels of room, and a second offers the quill from 240", async ({
  page,
}) => {
  // Five cameras fill the dock: nothing.
  await open(page, 4);
  await expect.poll(() => spareOf(page)).not.toBe("");
  expect(Number(await spareOf(page))).toBeLessThan(90);
  await expect.poll(() => fillWidths(page)).toEqual({ quill: 0, contract: 0 });
  const named = await style(list(page), "background-image");
  expect(named).toContain("art/contract.webp");
  expect(named).toContain("art/quill.webp");

  // Three cameras leave room for the contract, not yet the quill.
  await open(page, 2);
  await expect
    .poll(() => fillWidths(page))
    .toEqual({ quill: 0, contract: 300 });
  const spare = Number(await spareOf(page));
  expect(spare).toBeGreaterThanOrEqual(90);
  expect(spare).toBeLessThan(240);

  // Nine, two abreast, leave room for both.
  await open(page, 8);
  await expect
    .poll(() => fillWidths(page))
    .toEqual({ quill: 300, contract: 300 });
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(240);
  // Painted on the list itself: nothing of it scrolls, and it takes no clicks.
  expect(
    await list(page).evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBe(0);
});

test("across the top there is no room under the cameras, and nothing is drawn there", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /^Docked at the top/);

  await expect.poll(() => style(list(page), "background-image")).toBe("none");
});
