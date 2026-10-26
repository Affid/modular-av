import { describe, expect, it } from "vitest";
import {
  blurRadius,
  coverCrop,
  createRateCap,
  gaussianTaps,
  smoothingWeight,
} from "../src/pipeline/math.ts";

describe("the mask's smoothing over time", () => {
  it("takes the first mask as it is", () => {
    expect(smoothingWeight(null)).toBe(1);
  });

  it("weighs a new mask by the time since the last, the same at any frame rate", () => {
    // Two steps of 33 ms leave as much of the old mask as one of 66 ms.
    const kept = (dt: number): number => 1 - smoothingWeight(dt);

    expect(kept(33) * kept(33)).toBeCloseTo(kept(66), 5);
    expect(smoothingWeight(100)).toBeCloseTo(1 - Math.exp(-1), 5);
  });

  it("never lets a new mask count for less than a fifth", () => {
    expect(smoothingWeight(1)).toBe(0.2);
    expect(smoothingWeight(0)).toBe(0.2);
  });
});

describe("scaling a background image to the frame", () => {
  it("crops a wider image at its sides to cover the frame", () => {
    expect(coverCrop(1920, 1080, 640, 480)).toEqual({
      x: 240,
      y: 0,
      width: 1440,
      height: 1080,
    });
  });

  it("crops a taller image at its top and bottom", () => {
    expect(coverCrop(600, 900, 640, 480)).toEqual({
      x: 0,
      y: 225,
      width: 600,
      height: 450,
    });
  });

  it("keeps an image of the frame's shape whole", () => {
    expect(coverCrop(1280, 960, 640, 480)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 960,
    });
  });
});

describe("the blur", () => {
  it("grows with the strength, from a light blur to a strong one", () => {
    expect(blurRadius(0.1)).toBeLessThan(blurRadius(0.5));
    expect(blurRadius(0.5)).toBeLessThan(blurRadius(1));
    expect(blurRadius(0)).toBeGreaterThan(0);
    expect(blurRadius(2)).toBe(blurRadius(1));
  });

  it("samples a normalised Gaussian in pairs, using the texture's linear filtering", () => {
    const taps = gaussianTaps(6);

    const total =
      (taps.weights[0] ?? 0) +
      2 * taps.weights.slice(1).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(taps.offsets[0]).toBe(0);
    // Each tap past the centre reads between two texels.
    expect(taps.offsets.slice(1).every((o) => o % 1 !== 0)).toBe(true);
    expect(taps.weights.length).toBe(taps.offsets.length);
    expect(taps.weights.length).toBeLessThanOrEqual(8);
  });
});

describe("segmenting at a capped rate", () => {
  it("lets a segmentation through at most once per interval", () => {
    const cap = createRateCap(15);

    expect(cap.due(0)).toBe(true);
    cap.mark(0);
    expect(cap.due(30)).toBe(false);
    expect(cap.due(67)).toBe(true);
  });

  it("waits longer after a slow segmentation, so the frames keep coming", () => {
    const cap = createRateCap(15);
    cap.mark(0, 120);

    // It took 120 ms: the next waits as long again past the interval.
    expect(cap.due(100)).toBe(false);
    expect(cap.due(190)).toBe(true);
  });
});
