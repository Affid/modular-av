import { describe, expect, it } from "vitest";
import { fitFocus, fitGrid } from "../src/fit.ts";
import { keepOnScreen } from "../src/on-screen.ts";
import { placePopover } from "../src/position.ts";

const ASPECT = 16 / 9;

describe("fitGrid", () => {
  it("picks the column count that makes 16:9 tiles largest", () => {
    // Arrange / Act
    const wide = fitGrid({ count: 4, width: 1600, height: 300, gap: 0 });
    const square = fitGrid({ count: 4, width: 800, height: 450, gap: 0 });

    // Assert
    expect(wide).toEqual({ columns: 4, tileWidth: 400, scrolls: false });
    expect(square).toEqual({ columns: 2, tileWidth: 400, scrolls: false });
  });

  it("allows for the gap between tiles", () => {
    expect(fitGrid({ count: 2, width: 410, height: 1000, gap: 10 })).toEqual({
      columns: 1,
      tileWidth: 410,
      scrolls: false,
    });
  });

  it("scrolls down below the smallest tile, as many columns as fit", () => {
    const fit = fitGrid({
      count: 30,
      width: 400,
      height: 300,
      gap: 0,
      minTileWidth: 160,
    });

    expect(fit).toEqual({ columns: 2, tileWidth: 200, scrolls: true });
  });

  it("scrolls sideways in a horizontal dock, as many rows as fit", () => {
    const fit = fitGrid({
      count: 30,
      width: 400,
      height: 200,
      gap: 0,
      minTileWidth: 160,
      scroll: "sideways",
    });

    expect(fit.scrolls).toBe(true);
    expect(fit.columns).toBe(15);
    expect(fit.tileWidth).toBeCloseTo(100 * ASPECT);
  });

  it("fits nothing into no space", () => {
    expect(fitGrid({ count: 0, width: 100, height: 100, gap: 0 })).toEqual({
      columns: 1,
      tileWidth: 0,
      scrolls: false,
    });
    expect(fitGrid({ count: 3, width: 0, height: 100, gap: 0 }).tileWidth).toBe(
      0,
    );
  });
});

describe("fitFocus", () => {
  it("is the largest 16:9 box in the space", () => {
    expect(fitFocus({ width: 1600, height: 450 })).toEqual({
      width: 800,
      height: 450,
    });
    expect(fitFocus({ width: 320, height: 900 })).toEqual({
      width: 320,
      height: 180,
    });
  });
});

describe("keepOnScreen", () => {
  const viewport = { width: 1000, height: 800 };

  it("moves a box back inside the window, a margin from its edges", () => {
    expect(
      keepOnScreen({ left: 950, top: -40, width: 200, height: 100 }, viewport),
    ).toEqual({ left: 792, top: 8, width: 200, height: 100 });
  });

  it("shrinks a box bigger than the window", () => {
    expect(
      keepOnScreen({ left: 0, top: 0, width: 2000, height: 100 }, viewport, 0),
    ).toEqual({ left: 0, top: 0, width: 1000, height: 100 });
  });

  it("allows for what reaches past the box, such as a frame", () => {
    expect(
      keepOnScreen({ left: 0, top: 0, width: 100, height: 100 }, viewport, 0, {
        top: 20,
        right: 0,
        bottom: 0,
        left: 30,
      }),
    ).toEqual({ left: 30, top: 20, width: 100, height: 100 });
  });
});

describe("placePopover", () => {
  const viewport = { width: 1000, height: 800 };
  const anchor = { left: 100, top: 600, width: 40, height: 20 };

  it("opens above when there is room, aligned with its anchor", () => {
    expect(
      placePopover({ anchor, size: { width: 200, height: 300 }, viewport }),
    ).toEqual({ left: 100, top: 292, side: "above", room: 584 });
  });

  it("opens below when only below has room", () => {
    const top = { ...anchor, top: 50 };

    expect(
      placePopover({
        anchor: top,
        size: { width: 200, height: 300 },
        viewport,
      }),
    ).toMatchObject({ top: 78, side: "below" });
  });

  it("stays inside the window sideways", () => {
    const right = { ...anchor, left: 950 };

    expect(
      placePopover({
        anchor: right,
        size: { width: 200, height: 100 },
        viewport,
      }).left,
    ).toBe(792);
  });

  it("says how much room the larger side has, for content that scrolls", () => {
    const middle = { left: 100, top: 380, width: 40, height: 20 };

    expect(
      placePopover({
        anchor: middle,
        size: { width: 200, height: 2000 },
        viewport,
      }),
    ).toMatchObject({ side: "below", room: 384, top: 408 });
  });
});

describe("fitGrid with frames", () => {
  it("shrinks tiles so their frames fit beside and below them", () => {
    const reach = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 };

    const plain = fitGrid({ count: 1, width: 400, height: 1000, gap: 0 });
    const framed = fitGrid({
      count: 1,
      width: 400,
      height: 1000,
      gap: 0,
      reach,
    });

    expect(plain.tileWidth).toBe(400);
    // The tile and its frame, 1.2 times as wide, fill the width.
    expect(framed.tileWidth).toBeCloseTo(400 / 1.2);
  });

  it("allows for the frames below when height is short", () => {
    const reach = { top: 0.1, right: 0, bottom: 0.1, left: 0 };

    const fit = fitGrid({ count: 1, width: 1000, height: 225, gap: 0, reach });

    // 16:9 tiles: a frame 0.1 of the width tall on each side.
    const tall = fit.tileWidth * (9 / 16 + 0.2);
    expect(tall).toBeCloseTo(225);
  });
});
