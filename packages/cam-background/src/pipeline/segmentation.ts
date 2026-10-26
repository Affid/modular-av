import type { MaskSmoother } from "./mask-smoother.ts";
import { createRateCap } from "./math.ts";
import type { Segmenter } from "./segmenter.ts";

export interface Segmentation<F> {
  /**
   * Segments `frame` if it is time (or there is no mask yet) and steadies
   * the mask; returns when it started, or null if it didn't.
   */
  segment(frame: F, now: number): number | null;
  /** The frame segmented at `started` was sent: count the GPU's part too. */
  sent(started: number, now: number): void;
  /** Another quality: the old segmenter is closed, the masks so far forgotten. */
  setSegmenter(next: Segmenter): void;
  readonly segmentations: number;
  readonly segmentMs: number;
  /** Closes the segmenter it holds. */
  close(): void;
}

/** Owns the segmenter in use, so the one running is the one closed. */
export function createSegmentation<F>(
  first: Segmenter,
  smoother: MaskSmoother,
  now: () => number,
  perSecond: number,
): Segmentation<F> {
  const cap = createRateCap(perSecond);
  let segmenter = first;
  let segmentations = 0;
  let segmentMs = 0;
  return {
    segment(frame, at) {
      if (!cap.due(at) && smoother.texture) return null;
      const started = now();
      const current = segmenter;
      current.segment(frame as unknown as TexImageSource, (mask, w, h) => {
        smoother.update(mask, { width: w, height: h }, at, current.invert);
      });
      const took = now() - started;
      cap.mark(started, took);
      segmentations += 1;
      segmentMs += took;
      return started;
    },
    // The GPU's share of the segmentation shows once the frame is out: a
    // slow machine segments less often and keeps sending frames.
    sent(started, at) {
      cap.mark(started, at - started);
    },
    setSegmenter(next) {
      const old = segmenter;
      segmenter = next;
      smoother.reset();
      old.close();
    },
    get segmentations() {
      return segmentations;
    },
    get segmentMs() {
      return segmentMs;
    },
    close() {
      segmenter.close();
    },
  };
}
