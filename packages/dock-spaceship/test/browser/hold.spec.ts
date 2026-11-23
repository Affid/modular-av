// The hold itself: the dock as a bulkhead of painted steel edged in angle
// steel, its header and voice panel riveted plates, its buttons rubber
// keys, the call's lamp, and what hangs on the bare bulkhead under the
// cameras.
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  boxOf,
  button,
  dock,
  leave,
  list,
  open,
  place,
  scatter,
  spareOf,
  style,
  styleOf,
  tileOf,
} from "./page.ts";

test.use({ viewport: { width: 1280, height: 900 } });

/** The hole's wall at each side of a narrow key (art/arrow.webp, read off its pixels), in CSS pixels. */
const HOLE_WALL = 1.5;
/** How much of the key's face a chevron keeps clear of the hole on each side, at the least. */
const CHEVRON_CLEAR = 3;
/** Pixels to a CSS pixel in the pictures the chevron's ink is read from. */
const ZOOM = 8;

for (const placement of [
  "Docked on the left",
  "Docked on the right",
  "Floating",
] as const)
  test(`${placement}: the dock is a bulkhead of painted steel in a 600 px repeat, edged in angle steel, its header and panel riveted plates`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement !== "Docked on the left")
      await place(page, new RegExp(`^${placement}`));
    const bulkhead = dock(page);

    expect(await style(bulkhead, "background-image")).toContain(
      "art/bulkhead.webp",
    );
    expect(await style(bulkhead, "background-size")).toContain("600px 600px");
    expect(await style(bulkhead, "border-image-source")).toContain(
      "art/trim.webp",
    );
    // The angle steel costs the cameras nothing: no border, the same padding as the dock's own look.
    await expect(bulkhead).toHaveCSS("border-left-width", "0px");
    await expect(bulkhead).toHaveCSS("padding-left", "4px");
    for (const plate of [".mav-dock > .mav-dock-header", ".mav-dock-panel"]) {
      const at = page.locator(plate);
      expect(await style(at, "border-image-source")).toContain(
        "art/plate-rim.webp",
      );
      expect(await style(at, "background-image")).toContain("art/plate.webp");
      expect(await style(at, "background-image")).toContain("art/grime.webp");
    }
  });

test("floating and put away, the bulkhead is drawn only as tall as its two plates, the dock's own box kept, so a move saves the opened height", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /^Floating/);
  const before = await boxOf(dock(page));

  await page.locator(".mav-dock-collapse").click();
  await expect(dock(page)).toHaveAttribute("data-collapsed", "");

  const [shut, header, panel] = [
    await boxOf(dock(page)),
    await boxOf(page.locator(".mav-dock > .mav-dock-header")),
    await boxOf(page.locator(".mav-dock-panel")),
  ];
  // The dock keeps the height it was given: that is what a move saves.
  expect(shut.height).toBe(before.height);
  // The bulkhead, its angle steel and its shadow are a layer from the header's top to the panel's foot.
  expect(await style(dock(page), "background-image")).toBe("none");
  expect(await style(dock(page), "border-image-source")).toBe("none");
  const wall = await styleOf(
    dock(page),
    ["background-image", "border-image-source", "height"],
    "::before",
  );
  expect(wall["background-image"]).toContain("art/bulkhead.webp");
  expect(wall["border-image-source"]).toContain("art/trim.webp");
  const drawn = Number.parseFloat(wall.height ?? "");
  expect(header.y - shut.y).toBeLessThan(12);
  expect(Math.abs(shut.y + drawn - (panel.y + panel.height) - 4)).toBeLessThan(
    1,
  );
  // Under the plates the map takes the pointer, as if the dock ended there.
  const under = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest(".mav-dock") !== null,
    [shut.middle, shut.y + drawn + 20] as const,
  );
  expect(under).toBe(false);

  // Moved while put away, then placed again from what was saved (the window resized), it opens at its height.
  await page.locator(".mav-dock-move").focus();
  await page.keyboard.press("ArrowDown");
  await page.setViewportSize({ width: 1270, height: 900 });
  await page.locator(".mav-dock-collapse").click();
  await expect(dock(page)).not.toHaveAttribute("data-collapsed");
  expect((await boxOf(dock(page))).height).toBe(before.height);
});

test("floating, the dock's resize grip is a small rubber key in the plate's corner", async ({
  page,
}) => {
  await open(page, 1);
  await place(page, /^Floating/);
  const grip = page.locator(".mav-dock-resize");

  expect(await style(grip, "border-image-source")).toContain(
    "art/key-rest.webp",
  );
  const [key, bulkhead] = [await boxOf(grip), await boxOf(dock(page))];
  expect(key.width).toBe(22);
  expect(bulkhead.x + bulkhead.width - (key.x + key.width)).toBeLessThan(5);
});

for (const side of ["left", "right"] as const)
  test(`put away on the ${side}, the plates are a narrow rail with no rivets between their corners`, async ({
    page,
  }) => {
    await open(page, 1);
    if (side === "right") await place(page, /^Docked on the right/);
    await page.locator(".mav-dock-collapse").click();
    await expect(dock(page)).toHaveAttribute("data-collapsed", "");

    for (const plate of [".mav-dock > .mav-dock-header", ".mav-dock-panel"])
      expect(await style(page.locator(plate), "border-image-source")).toContain(
        "art/plate-rim-plain.webp",
      );
  });

test("scattered there is no bulkhead round the dock: the panel alone is a small plate framed in angle steel", async ({
  page,
}) => {
  await open(page, 1);
  await scatter(page);

  expect(await style(dock(page), "border-image-source")).toBe("none");
  expect(
    await style(page.locator(".mav-dock-panel"), "border-image-source"),
  ).toContain("art/trim.webp");
  // The tile's resize key stands up its right edge, clear of the corner where a headset hangs.
  const tile = tileOf(page, "p1");
  await tile.hover();
  const [picture, resize] = [
    await boxOf(tile),
    await boxOf(tile.locator(".mav-dock-tile-resize")),
  ];
  expect(resize.y + resize.height).toBeLessThan(
    picture.y + picture.height * 0.65,
  );
});

test("the call's status is a pilot lamp: green in the call, red once the call has ended, dark before any", async ({
  page,
}) => {
  await open(page, 1);
  const status = page.locator(".mav-dock > .mav-dock-header .mav-dock-status");
  const lamp = (): Promise<string> =>
    style(status, "background-image", "::before");

  await expect(status).toHaveAttribute("data-status", "connected");
  expect(await lamp()).toContain("art/lamp-green.webp");
  // Ended (left, put out, the room closed): the dock's own look marks it in a colour of its own.
  await leave(page);
  await expect(status).toHaveAttribute("data-status", "ended");
  expect(await lamp()).toContain("art/lamp-red.webp");
  // Idle and joining keep the lamp dark and amber.
  await status.evaluate((el) => {
    el.dataset.status = "idle";
  });
  expect(await lamp()).toContain("art/lamp-off.webp");
  await status.evaluate((el) => {
    el.dataset.status = "connecting";
  });
  expect(await lamp()).toContain("art/lamp-amber.webp");
});

test("the buttons are rubber keys; the ones that latch carry an LED that lights with the key down in its hole", async ({
  page,
}) => {
  await open(page, 1);
  const mic = button(page, "mute");
  expect(await style(mic, "border-image-source")).toContain(
    "art/key-led-red.webp",
  );
  expect(await style(button(page, "video"), "border-image-source")).toMatch(
    /art\/key-(led|down)-green\.webp/,
  );
  expect(await style(button(page, "leave"), "border-image-source")).toContain(
    "art/key-leave.webp",
  );

  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);

  expect(await style(mic, "border-image-source")).toContain(
    "art/key-down-red.webp",
  );
  await mic.hover();
  expect(await style(mic, "border-image-source")).toContain(
    "art/key-down-red-hover.webp",
  );
  await expect(mic).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("a key lights up under keyboard focus as it does under the pointer", async ({
  page,
}) => {
  await open(page, 1);
  const mic = button(page, "mute");

  await mic.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(mic).toBeFocused();

  expect(await style(mic, "border-image-source")).toContain(
    "art/key-led-red-hover.webp",
  );
});

/**
 * Where the chevron's ink is across its key, in CSS pixels from the key's
 * left: read off a picture of the key (taken at ZOOM pixels to one), since
 * the icon's box is wider than the glyph it draws. The ink is the cream of
 * the icon in the middle half of the key's height and the middle 70% of its
 * width (a chevron reaching past that is too close to the hole anyway).
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
    // The key's lit rim stays out of it: only its middle 70% across is read.
    for (let y = Math.floor(height / 4); y < (3 * height) / 4; y += 1)
      for (let x = Math.floor(width * 0.15); x < width * 0.85; x += 1) {
        const k = (y * width + x) * 4;
        const lum =
          (0.2126 * (px[k] ?? 0) +
            0.7152 * (px[k + 1] ?? 0) +
            0.0722 * (px[k + 2] ?? 0)) /
          255;
        if (lum > 0.6) {
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

const expectClear = (
  found: { width: number; inkLeft: number; inkRight: number },
  label: string,
): void => {
  const left = found.inkLeft - HOLE_WALL;
  const right = found.width - HOLE_WALL - found.inkRight;
  expect(left, `${label}: face left of the chevron`).toBeGreaterThanOrEqual(
    CHEVRON_CLEAR,
  );
  expect(right, `${label}: face right of it`).toBeGreaterThanOrEqual(
    CHEVRON_CLEAR,
  );
  expect(Math.abs(left - right), `${label}: centred`).toBeLessThanOrEqual(1);
};

test.describe("drawn at eight pixels to one", () => {
  test.use({ deviceScaleFactor: ZOOM });

  for (const where of ["in the panel", "at the top, put away"] as const)
    test(`a menu arrow's chevron sits in the middle of its key's face, clear of the hole on both sides, ${where}`, async ({
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
        expect(await style(arrow, "border-image-source")).toContain(
          "art/arrow.webp",
        );
        expectClear(await inkOf(arrow), `${which} at rest`);
        await arrow.hover();
        expect(await style(arrow, "border-image-source")).toContain(
          "art/arrow-hover.webp",
        );
        expectClear(await inkOf(arrow), `${which} under the pointer`);
      }
      const menu = page.locator(".mav-dock-buttons .mav-dock-mic-menu");
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      expect(await style(menu, "border-image-source")).toContain(
        "art/arrow-down",
      );
      expectClear(await inkOf(menu), "mic open");
    });
});

/**
 * The widths the wall's things are drawn at under the cameras, in the
 * order the list's ::before lays them: the extinguisher, the clipboard,
 * the wrench, the tape, and the three rails. A width with a percentage in
 * it stays an expression in the computed style: it is resolved against the
 * list's width by laying it out as a width.
 */
const thingWidths = (page: Page): Promise<number[]> =>
  list(page).evaluate((el) => {
    // Each layer's size is "<width> <height>", layers parted by commas; a width may hold brackets and spaces.
    const widths: string[] = [];
    let depth = 0;
    let word = "";
    let words: string[] = [];
    for (const ch of `${getComputedStyle(el, "::before").backgroundSize},`) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (depth > 0 || (ch !== " " && ch !== ",")) {
        word += ch;
        continue;
      }
      if (word) words = [...words, word];
      word = "";
      if (ch === ",") {
        widths.push(words[0] ?? "0px");
        words = [];
      }
    }
    const box = el.ownerDocument.createElement("div");
    box.style.cssText = `position:absolute;visibility:hidden;width:${String(el.clientWidth)}px`;
    const probe = el.ownerDocument.createElement("div");
    box.append(probe);
    el.ownerDocument.body.append(box);
    const resolved = widths.map((width) => {
      probe.style.width = width;
      return Math.round(probe.getBoundingClientRect().width);
    });
    box.remove();
    return resolved;
  });

/** Which of the things show, by name. */
const shown = async (page: Page): Promise<string[]> => {
  const names = [
    "extinguisher",
    "clipboard",
    "wrench",
    "tape",
    "rail",
    "rail",
    "rail",
  ];
  const widths = await thingWidths(page);
  return [...new Set(names.filter((_, i) => (widths[i] ?? 0) > 0))].sort();
};

test("the bare bulkhead: nothing in a full dock, the tape in a little room, more with more, everything with one camera large", async ({
  page,
}) => {
  // Five cameras fill the dock: nothing.
  await open(page, 4);
  await expect.poll(() => spareOf(page)).not.toBe("");
  expect(Number(await spareOf(page))).toBeLessThan(90);
  await expect.poll(() => shown(page)).toEqual([]);
  const named = await style(list(page), "background-image", "::before");
  for (const thing of ["extinguisher", "clipboard", "wrench", "tape", "rail"])
    expect(named).toContain(`art/${thing}.webp`);

  // Three cameras leave room for the tape on its rail.
  await open(page, 2);
  await expect.poll(() => shown(page)).toEqual(["rail", "tape"]);

  // Nine, two abreast: the clipboard beside the tape and the wrench.
  await open(page, 8);
  await expect
    .poll(() => shown(page))
    .toEqual(["clipboard", "rail", "tape", "wrench"]);

  // One large among three: the extinguisher too.
  await open(page, 2);
  await page.locator(".mav-dock-layout").click();
  await expect
    .poll(() => shown(page))
    .toEqual(["clipboard", "extinguisher", "rail", "tape", "wrench"]);
  // Drawn behind the list: nothing of it scrolls.
  expect(
    await list(page).evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBe(0);
});

test("in a dock too narrow for the right-hand rail, what hangs there is left out rather than cut off", async ({
  page,
}) => {
  await open(page, 2);
  await page.addStyleTag({
    content: "#camera-views { --mav-dock-width: 240px }",
  });
  await page.locator(".mav-dock-layout").click();
  await expect
    .poll(() => list(page).evaluate((el) => el.clientWidth))
    .toBeLessThan(240);

  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(388);
  const widths = await thingWidths(page);
  // The extinguisher and its rail on the left stay; the clipboard, the wrench, the tape and the right-hand rails go.
  expect(widths).toEqual([169, 0, 0, 0, 147, 0, 0]);
});

test("across the top there is no room under the cameras, and nothing is drawn there", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /^Docked at the top/);

  await expect.poll(() => shown(page)).toEqual([]);
});
