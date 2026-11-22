// The box itself: the dock as the front of a strongbox of oiled boards in
// an iron band, its corner brackets and padlock in every placement, its
// buttons as forged plates, the boards evened where names land, and what
// the bare boards under the cameras carry.
import { expect, type Locator, type Page, test } from "@playwright/test";
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
  styleOf,
  tileOf,
} from "./page.ts";

test.use({ viewport: { width: 1280, height: 900 } });

/** The plate's raised rim at each side of a button (art/button.webp, read off its pixels), in CSS pixels. */
const PLATE_RIM = 1.5;
/** How much flat plate a chevron keeps clear of the rim on each side, at the least. */
const CHEVRON_CLEAR = 3;
/** Pixels to a CSS pixel in the pictures the chevron's ink is read from. */
const ZOOM = 8;

/** A box drawn by a pseudo-element, on screen, from its element's box and its own computed insets and size. */
async function pseudoBox(
  target: Locator,
  pseudo: "::before" | "::after",
): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return target.evaluate((el, which) => {
    const outer = el.getBoundingClientRect();
    // A pseudo-element is placed in its element's padding box.
    const host = {
      left: outer.left + el.clientLeft,
      top: outer.top + el.clientTop,
      width: el.clientWidth,
      height: el.clientHeight,
    };
    const s = getComputedStyle(el, which);
    const px = (v: string): number => Number.parseFloat(v);
    const width = px(s.width);
    const height = px(s.height);
    const left =
      s.left === "auto" ? host.width - px(s.right) - width : px(s.left);
    const top =
      s.top === "auto" ? host.height - px(s.bottom) - height : px(s.top);
    return {
      left: host.left + left,
      top: host.top + top,
      right: host.left + left + width,
      bottom: host.top + top + height,
    };
  }, pseudo);
}

for (const placement of [
  "Docked on the left",
  "Docked at the top",
  "Floating",
] as const)
  test(`${placement}: the dock is the box's front, boards that repeat at any size, in an iron band with a bracket on each corner`, async ({
    page,
  }) => {
    await open(page, 2);
    if (placement !== "Docked on the left")
      await place(page, new RegExp(`^${placement}`));
    const box = dock(page);

    expect(await style(box, "border-image-source")).toContain("art/strap.webp");
    await expect(box).toHaveCSS("border-top-width", "8px");
    // The theme leaves the dock's own positioning alone: a floating box stays where it was put.
    await expect(box).toHaveCSS(
      "position",
      placement === "Floating" ? "fixed" : "relative",
    );
    expect(await style(box, "background-image")).toContain("art/ground.webp");
    expect(await style(box, "background-size")).toContain("600px 600px");
    const [header, panel] = [
      page.locator(".mav-dock-header"),
      page.locator(".mav-dock-panel"),
    ];
    const corners = [
      await style(header, "background-image", "::before"),
      await style(panel, "background-image", "::before"),
    ].join(" ");
    for (const corner of ["tl", "tr", "bl", "br"])
      expect(corners).toContain(`art/bracket-${corner}.webp`);
    // The brackets lie on the dock's own corners, whatever its shape.
    const outer = await boxOf(box);
    const first = await pseudoBox(header, "::before");
    const last = await pseudoBox(panel, "::before");
    expect(first.left).toBeCloseTo(outer.x, 0);
    expect(first.top).toBeCloseTo(outer.y, 0);
    expect(last.right).toBeCloseTo(outer.x + outer.width, 0);
    expect(last.bottom).toBeCloseTo(outer.y + outer.height, 0);
    // The padlock hangs from the top strap at the header's right.
    expect(await style(header, "background-image", "::after")).toContain(
      "art/padlock.webp",
    );
  });

test("floating, the resize grip lies on the bottom strap, clear of the corner's bracket", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /^Floating/);
  const grip = page.locator(".mav-dock-resize");
  await expect(grip).toBeVisible();

  const [handle, corners] = [
    await boxOf(grip),
    await pseudoBox(page.locator(".mav-dock-panel"), "::before"),
  ];
  // The bottom right bracket is the last 30 pixels of the panel's corner layer.
  const bracket = { left: corners.right - 30, top: corners.bottom - 30 };
  const clear =
    handle.x + handle.width <= bracket.left ||
    handle.y + handle.height <= bracket.top;

  expect(clear).toBe(true);
  expect(handle.y + handle.height).toBeGreaterThan(bracket.top);
});

test("scattered there is no box round the dock: each window lies on its own panel of boards in a strap, and the header and panel keep theirs", async ({
  page,
}) => {
  await open(page, 1);
  await scatter(page);

  expect(await style(dock(page), "border-image-source")).toBe("none");
  const panel = await styleOf(
    tileOf(page, "p1"),
    ["background-image", "border-image-source", "z-index"],
    "::before",
  );
  expect(panel["background-image"]).toContain("art/ground.webp");
  expect(panel["border-image-source"]).toContain("art/strap.webp");
  expect(panel["z-index"]).toBe("-1");
  expect(
    await style(page.locator(".mav-dock-panel"), "border-image-source"),
  ).toContain("art/strap.webp");
  expect(
    await style(
      page.locator(".mav-dock-header"),
      "background-image",
      "::after",
    ),
  ).toBe("none");
});

for (const side of ["left", "right"] as const)
  test(`collapsed on the ${side}, one strap round the rail, no padlock, smaller brackets on its corners`, async ({
    page,
  }) => {
    await open(page, 1);
    if (side === "right") await place(page, /^Docked on the right/);

    await page.locator(".mav-dock-collapse").click();
    await expect(dock(page)).toHaveAttribute("data-collapsed", "");

    const header = page.locator(".mav-dock-header");
    expect(await style(header, "content", "::after")).toBe("none");
    expect(await style(header, "border-image-source")).toBe("none");
    expect(await style(header, "background-size", "::before")).toContain(
      "24px 24px",
    );
    expect(await style(dock(page), "border-image-source")).toContain(
      "art/strap.webp",
    );
  });

test("the buttons are forged plates; a pressed one is sunk in its rim with the lamp on its lower lip", async ({
  page,
}) => {
  await open(page, 1);
  const mic = button(page, "mute");
  expect(await style(mic, "border-image-source")).toContain("art/button.webp");
  expect(await style(button(page, "leave"), "border-image-source")).toContain(
    "art/button-pressed.webp",
  );

  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "true");

  expect(await style(mic, "border-image-source")).toContain(
    "art/button-pressed.webp",
  );
  // A real colour under the plate, for contrast checks and the slices' hairlines.
  await expect(mic).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await style(mic, "background-image")).toContain("linear-gradient");
});

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

const expectClear = (
  found: { width: number; inkLeft: number; inkRight: number },
  label: string,
): void => {
  const left = found.inkLeft - PLATE_RIM;
  const right = found.width - PLATE_RIM - found.inkRight;
  expect(left, `${label}: plate left of the chevron`).toBeGreaterThanOrEqual(
    CHEVRON_CLEAR,
  );
  expect(right, `${label}: plate right of it`).toBeGreaterThanOrEqual(
    CHEVRON_CLEAR,
  );
  expect(Math.abs(left - right), `${label}: centred`).toBeLessThanOrEqual(1);
};

test.describe("drawn at eight pixels to one", () => {
  test.use({ deviceScaleFactor: ZOOM });

  for (const where of ["in the panel", "at the top, put away"] as const)
    test(`a menu arrow's chevron sits in the middle of its plate, clear of the rim on both sides, ${where}`, async ({
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
          "art/button",
        );
        expectClear(await inkOf(arrow), `${which} at rest`);
        await arrow.hover();
        expectClear(await inkOf(arrow), `${which} under the pointer`);
      }
      const mute = button(page, "mute");
      await mute.click();
      await expect(mute).toHaveAttribute("aria-pressed", "true");
      expectClear(
        await inkOf(page.locator(".mav-dock-buttons .mav-dock-mic-menu")),
        "mic pressed",
      );
    });
});

/** How wide a strip the seam's step is read over, in the picture's pixels: wider than its grain. */
const STRIP = 8;

interface Boards {
  /** The mean light of every band a name tall, as a share of the whole. */
  readonly bands: readonly number[];
  /** The step in mean light between the strips either side of the repeat's seam, across and down. */
  readonly seam: { readonly x: number; readonly y: number };
  /** The same step between neighbouring strips everywhere inside the picture, sorted. */
  readonly inside: {
    readonly x: readonly number[];
    readonly y: readonly number[];
  };
}

/** The boards' light, read off the shipped picture. */
const boards = (page: Page, bandCss: number): Promise<Boards> =>
  page.evaluate(
    async ([band, strip]) => {
      const image = new Image();
      image.src = "/modules/modular-av-dock-strongbox/art/ground.webp";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No canvas");
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const linear = (v: number): number => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const rows = new Float64Array(height);
      const cols = new Float64Array(width);
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
          const k = (y * width + x) * 4;
          const lum =
            0.2126 * linear(data[k] ?? 0) +
            0.7152 * linear(data[k + 1] ?? 0) +
            0.0722 * linear(data[k + 2] ?? 0);
          rows[y] = (rows[y] ?? 0) + lum / width;
          cols[x] = (cols[x] ?? 0) + lum / height;
        }
      const mean = rows.reduce((a, b) => a + b, 0) / height;
      /** The mean of `n` lines from `at`, wrapping. */
      const run = (lines: Float64Array, at: number, n: number): number => {
        let sum = 0;
        for (let j = 0; j < n; j += 1)
          sum += lines[(at + j + lines.length) % lines.length] ?? 0;
        return sum / n;
      };
      const tall = Math.round((band * height) / 600);
      const bands = [];
      for (let y = 0; y < height; y += 2) bands.push(run(rows, y, tall) / mean);
      /** The step between the strips before and after a line, as a share of the whole. */
      const step = (lines: Float64Array, at: number): number =>
        Math.abs(run(lines, at, strip) - run(lines, at - strip, strip)) / mean;
      const inside = (lines: Float64Array): number[] => {
        const steps = [];
        for (let at = strip; at <= lines.length - strip; at += 1)
          steps.push(step(lines, at));
        return steps.sort((a, b) => a - b);
      };
      return {
        bands,
        seam: { x: step(cols, 0), y: step(rows, 0) },
        inside: { x: inside(cols), y: inside(rows) },
      };
    },
    [bandCss, STRIP] as const,
  );

/** The value under which `share` of the sorted values lie. */
const percentile = (sorted: readonly number[], share: number): number =>
  sorted[Math.floor(share * (sorted.length - 1))] ?? 0;

test("the boards are even where a name or a gap can land, and meet themselves at every edge", async ({
  page,
}) => {
  await open(page, 1);

  const found = await boards(page, 16);

  // No band of boards a name tall is more than 6% lighter or darker than the boards as a whole.
  expect(Math.max(...found.bands)).toBeLessThan(1.06);
  expect(Math.min(...found.bands)).toBeGreaterThan(0.94);
  // The repeat's seam is no more of a step than the boards have inside: down, less than nine in ten places;
  // across, where a board's end joint lies four pixels in from the edge, less than ninety-nine in a hundred
  // (the boards' joints make the largest steps across).
  expect(found.seam.y).toBeLessThanOrEqual(percentile(found.inside.y, 0.9));
  expect(found.seam.x).toBeLessThanOrEqual(percentile(found.inside.x, 0.99));
});

/**
 * The widths the things are drawn at under the cameras: the rope, the
 * picks, the keys, the knife. A size with a percentage in it stays an
 * expression in the computed style: it is resolved against the list's
 * padding box by laying it out as a width.
 */
const thingWidths = (page: Page): Promise<number[]> =>
  list(page).evaluate((el) => {
    // Each layer's size is "<width> <height>", layers parted by commas; a width may hold brackets and spaces.
    const widths: string[] = [];
    let depth = 0;
    let word = "";
    let words: string[] = [];
    for (const ch of `${getComputedStyle(el).backgroundSize},`) {
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
      return probe.getBoundingClientRect().width;
    });
    box.remove();
    return resolved;
  });

test("the bare boards: none in a full dock, the knife alone in a little room, the picks beside it in more, all four with one camera large", async ({
  page,
}) => {
  // Five cameras fill the dock: nothing.
  await open(page, 4);
  await expect.poll(() => spareOf(page)).not.toBe("");
  expect(Number(await spareOf(page))).toBeLessThan(95);
  await expect.poll(() => thingWidths(page)).toEqual([0, 0, 0, 0]);
  const named = await style(list(page), "background-image");
  for (const thing of ["grapnel", "picks", "keys", "knife"])
    expect(named).toContain(`art/${thing}.webp`);

  // Three cameras leave room for the knife alone.
  await open(page, 2);
  await expect.poll(() => thingWidths(page)).toEqual([0, 0, 0, 195]);
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(95);

  // Nine, two abreast, leave room for the picks beside it.
  await open(page, 8);
  await expect.poll(() => thingWidths(page)).toEqual([0, 84, 0, 195]);

  // One large among three: all of them.
  await open(page, 2);
  await page.locator(".mav-dock-layout").click();
  await expect.poll(() => thingWidths(page)).toEqual([143, 84, 117, 195]);
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(330);
  // Painted on the list itself: nothing of it scrolls.
  expect(
    await list(page).evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBe(0);
});

test("in a dock too narrow for them, the pieces that would not fit on the boards are left out", async ({
  page,
}) => {
  await open(page, 2);
  await page.addStyleTag({
    content: "#camera-views { --mav-dock-width: 200px }",
  });
  await page.locator(".mav-dock-layout").click();
  await expect
    .poll(() => list(page).evaluate((el) => el.clientWidth))
    .toBeLessThan(190);

  // Room down the boards for the knife, the picks and the keys, but too narrow even for the knife.
  expect(Number(await spareOf(page))).toBeGreaterThanOrEqual(250);
  await expect.poll(() => thingWidths(page)).toEqual([0, 0, 0, 0]);
});

test("across the top there is no room under the cameras, and nothing is drawn there", async ({
  page,
}) => {
  await open(page, 2);
  await place(page, /^Docked at the top/);

  await expect.poll(() => thingWidths(page)).toEqual([0, 0, 0, 0]);
});
