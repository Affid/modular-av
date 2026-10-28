import { describe, expect, it } from "vitest";
import { fitSpeaker } from "../src/fit.ts";

describe("fitSpeaker", () => {
  it("alone, is the largest 16:9 tile in the space", () => {
    const fit = fitSpeaker({ count: 1, width: 300, height: 600, gap: 6 });

    expect(fit).toEqual({ span: 1, focusWidth: 300, thumbWidth: 300 });
  });

  it("down, puts thumbnails a third as wide under the large tile", () => {
    // Arrange: a side dock, room enough below.
    const fit = fitSpeaker({ count: 2, width: 300, height: 800, gap: 6 });

    // Assert: three columns, the large tile across all of them.
    expect(fit.span).toBe(3);
    expect(fit.thumbWidth).toBeCloseTo(96);
    expect(fit.focusWidth).toBeCloseTo(300);
  });

  it("down, shrinks everything together when the height is short", () => {
    const fit = fitSpeaker({ count: 4, width: 600, height: 300, gap: 0 });

    // Three columns: the large tile 3w wide, one row of w under it.
    const height = (fit.focusWidth + fit.thumbWidth) * (9 / 16);
    expect(height).toBeCloseTo(300);
    expect(fit.focusWidth).toBeCloseTo(3 * fit.thumbWidth);
  });

  it("down, never makes thumbnails narrower than the smallest tile when there is width", () => {
    const fit = fitSpeaker({
      count: 12,
      width: 900,
      height: 200,
      gap: 0,
      minTileWidth: 120,
    });

    expect(fit.thumbWidth).toBeGreaterThanOrEqual(120);
  });

  it("sideways, stacks two rows of thumbnails beside a full-height tile", () => {
    const fit = fitSpeaker({
      count: 4,
      width: 1200,
      height: 213,
      gap: 6,
      scroll: "sideways",
    });

    expect(fit.span).toBe(2);
    const thumbHeight = fit.thumbWidth * (9 / 16);
    expect(2 * thumbHeight + 6).toBeCloseTo(213);
    expect(fit.focusWidth).toBeCloseTo(2 * fit.thumbWidth + 6);
  });

  it("sideways, keeps one row when two would be too small", () => {
    const fit = fitSpeaker({
      count: 3,
      width: 1200,
      height: 100,
      gap: 6,
      scroll: "sideways",
    });

    expect(fit.span).toBe(1);
  });

  it("fits nothing into no space", () => {
    expect(fitSpeaker({ count: 3, width: 0, height: 100, gap: 6 })).toEqual({
      span: 1,
      focusWidth: 0,
      thumbWidth: 0,
    });
  });
});

describe("fitSpeaker with frames and narrow spaces", () => {
  it("shrinks the tiles so frames beside them fit too", () => {
    const bare = fitSpeaker({ count: 3, width: 300, height: 800, gap: 0 });
    const framed = fitSpeaker({
      count: 3,
      width: 300,
      height: 800,
      gap: 0,
      reach: { top: 0, right: 0.1, bottom: 0, left: 0.1 },
    });

    expect(framed.focusWidth).toBeCloseTo(bare.focusWidth / 1.2);
  });

  it("sideways, never makes the large tile wider than the dock", () => {
    const fit = fitSpeaker({
      count: 3,
      width: 200,
      height: 400,
      gap: 0,
      scroll: "sideways",
    });

    expect(fit.focusWidth).toBeLessThanOrEqual(200);
  });

  it("down, in a space too narrow for two thumbnails, spans one column", () => {
    const fit = fitSpeaker({ count: 3, width: 150, height: 800, gap: 6 });

    expect(fit.span).toBe(1);
  });
});
