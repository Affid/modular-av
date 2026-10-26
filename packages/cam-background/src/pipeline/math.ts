/** How long a change of the mask takes to mostly show, in milliseconds. */
const TIME_CONSTANT_MS = 100;
/** The least a new mask counts, so the mask never lags far behind. */
const MIN_WEIGHT = 0.2;

/**
 * How much a new mask counts against the one before, by the time between
 * them: an exponential moving average with a time constant, so the edge
 * steadies alike at any frame rate while following real movement. Null:
 * there is no mask before it.
 */
export function smoothingWeight(sinceLastMs: number | null): number {
  if (sinceLastMs === null) return 1;
  return Math.max(MIN_WEIGHT, 1 - Math.exp(-sinceLastMs / TIME_CONSTANT_MS));
}

export interface Crop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of an image that covers a frame of another shape, centred. */
export function coverCrop(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): Crop {
  const scale = Math.min(imageWidth / frameWidth, imageHeight / frameHeight);
  const width = Math.round(frameWidth * scale);
  const height = Math.round(frameHeight * scale);
  return {
    x: Math.round((imageWidth - width) / 2),
    y: Math.round((imageHeight - height) / 2),
    width,
    height,
  };
}

/** In texels of the quarter-size copy the blur works on. */
const MIN_RADIUS = 2;
const MAX_RADIUS = 14;

/** The blur's radius for a strength from 0 to 1. */
export function blurRadius(strength: number): number {
  const s = Math.min(1, Math.max(0, strength));
  return Math.round(MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * s);
}

export interface GaussianTaps {
  /** In texels from the centre; the first is the centre itself. */
  readonly offsets: readonly number[];
  readonly weights: readonly number[];
}

/**
 * A normalised Gaussian of `radius` texels each way, read in pairs: one
 * linearly filtered read between two texels weighs both, so a radius of 14
 * takes 8 reads per pass instead of 15.
 */
export function gaussianTaps(radius: number): GaussianTaps {
  const sigma = Math.max(1, radius / 2);
  const discrete = Array.from({ length: radius + 1 }, (_, i) =>
    Math.exp(-(i * i) / (2 * sigma * sigma)),
  );
  const total =
    (discrete[0] ?? 0) + 2 * discrete.slice(1).reduce((a, b) => a + b, 0);
  const w = discrete.map((v) => v / total);
  const offsets = [0];
  const weights = [w[0] ?? 0];
  for (let i = 1; i <= radius; i += 2) {
    const a = w[i] ?? 0;
    const b = w[i + 1] ?? 0;
    offsets.push((i * a + (i + 1) * b) / (a + b));
    weights.push(a + b);
  }
  return { offsets, weights };
}

export interface RateCap {
  /** Whether a segmentation may start now (ms, any monotonic clock). */
  due(now: number): boolean;
  /** One started at `startedAt` and took `tookMs`. */
  mark(startedAt: number, tookMs?: number): void;
}

/**
 * At most `perSecond` segmentations, and after a slow one a pause as long
 * as it took: frames go on being drawn with the last mask in between.
 */
export function createRateCap(perSecond: number): RateCap {
  const interval = 1000 / perSecond;
  let next = -Infinity;
  return {
    due: (now) => now >= next,
    mark(startedAt, tookMs = 0) {
      next = startedAt + interval + tookMs;
    },
  };
}
