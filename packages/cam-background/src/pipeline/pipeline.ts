import type { Compositor } from "./compositor.ts";
import type { MaskSmoother } from "./mask-smoother.ts";
import { blurRadius, coverCrop, createRateCap } from "./math.ts";
import type { Segmenter } from "./segmenter.ts";

export type Mode = "blur" | "replace";

/** Most segmentations a second; frames between them reuse the last mask. */
export const SEGMENT_RATE = 15;

/** What the pipeline did so far, for measurements. */
export interface PipelineStats {
  readonly frames: number;
  readonly segmentations: number;
  /** Total time spent in MediaPipe's `segmentForVideo` (its GPU wait included). */
  readonly segmentMs: number;
  /** Total time spent compositing (submitting the GPU's work). */
  readonly drawMs: number;
  /** Total time spent turning the canvas into a frame (waits for the GPU). */
  readonly captureMs: number;
  /** Total time spent waiting for the output to take a frame. */
  readonly sendMs: number;
  /** Frames not sent: no mask or no image yet. */
  readonly dropped: number;
}

export interface FrameLike {
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly timestamp: number;
  close(): void;
}

export interface PipelineDeps<F extends FrameLike, I> {
  readonly canvas: { width: number; height: number };
  readonly compositor: Compositor;
  readonly smoother: MaskSmoother;
  readonly now: () => number;
  /** The canvas as it is drawn now, as a frame to send. */
  readonly capture: (timestamp: number) => F;
  /** Crops and scales the background image to the frame, once per size. */
  readonly scaleImage: (
    image: I,
    crop: ReturnType<typeof coverCrop>,
    width: number,
    height: number,
  ) => Promise<TexImageSource>;
  readonly imageSize: (image: I) => { width: number; height: number };
  /** After the first frame was sent. */
  readonly onFirstFrame: () => void;
  /** It stopped working; no more frames will come. */
  readonly onError: (error: unknown) => void;
  readonly segmentRate?: number;
}

export interface Pipeline<F, I> {
  /** A camera restart: read from this instead. */
  setInput(input: ReadableStream<F>): void;
  setStrength(strength: number): void;
  setImage(image: I | null): void;
  /** Another quality: the old segmenter is closed. */
  setSegmenter(segmenter: Segmenter): void;
  stats(): PipelineStats;
  stop(): Promise<void>;
}

type Counters = { -readonly [K in keyof PipelineStats]: PipelineStats[K] };

/**
 * Reads the camera's frames, segments them at a capped rate and sends each
 * one drawn with the latest mask. It never sends a frame without a mask
 * (or, replacing, without the image): fail closed.
 */
export function startPipeline<F extends FrameLike, I>(
  deps: PipelineDeps<F, I>,
  start: {
    readonly mode: Mode;
    readonly strength: number;
    readonly image: I | null;
    readonly segmenter: Segmenter;
    readonly input: ReadableStream<F>;
    readonly output: WritableStream<F>;
  },
): Pipeline<F, I> {
  const cap = createRateCap(deps.segmentRate ?? SEGMENT_RATE);
  const counters: Counters = {
    frames: 0,
    segmentations: 0,
    segmentMs: 0,
    drawMs: 0,
    captureMs: 0,
    sendMs: 0,
    dropped: 0,
  };
  let segmenter = start.segmenter;
  let strength = start.strength;
  let image = start.image;
  /** The size the image was scaled for, so it is scaled once per size. */
  let imageFor = "";
  let reader = start.input.getReader();
  const writer = start.output.getWriter();
  let stopped = false;
  let first = true;
  let inputChanged: () => void = () => undefined;

  const scaleFor = (width: number, height: number): void => {
    const key = `${String(width)}x${String(height)}`;
    if (!image || imageFor === key) return;
    imageFor = key;
    const source = image;
    const size = deps.imageSize(source);
    const crop = coverCrop(size.width, size.height, width, height);
    deps.scaleImage(source, crop, width, height).then(
      (scaled) => {
        if (image === source && !stopped) deps.compositor.setImage(scaled);
      },
      (error: unknown) => {
        fail(error);
      },
    );
  };

  /** Segments if it is time; returns when it started, or null. */
  const segment = (frame: F, now: number): number | null => {
    if (!cap.due(now) && deps.smoother.texture) return null;
    const started = deps.now();
    segmenter.segment(frame as unknown as TexImageSource, (mask, w, h) => {
      deps.smoother.update(
        mask,
        { width: w, height: h },
        now,
        segmenter.invert,
      );
    });
    const took = deps.now() - started;
    cap.mark(started, took);
    counters.segmentations += 1;
    counters.segmentMs += took;
    return started;
  };

  const process = async (frame: F): Promise<void> => {
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    const segmented = segment(frame, deps.now());
    const mask = deps.smoother.texture;
    scaleFor(width, height);
    const ready = start.mode === "blur" || deps.compositor.hasImage;
    if (!mask || !ready) {
      counters.dropped += 1;
      return;
    }
    const started = deps.now();
    // MediaPipe may size the shared canvas for itself.
    if (deps.canvas.width !== width) deps.canvas.width = width;
    if (deps.canvas.height !== height) deps.canvas.height = height;
    deps.compositor.uploadFrame(
      frame as unknown as TexImageSource,
      width,
      height,
    );
    deps.compositor.draw(
      start.mode === "blur"
        ? { mode: "blur", radius: blurRadius(strength) }
        : { mode: "replace" },
      mask,
    );
    const drawn = deps.now();
    const out = deps.capture(frame.timestamp);
    const captured = deps.now();
    try {
      await writer.write(out);
    } finally {
      out.close();
    }
    // The GPU's share of the segmentation shows once the frame is out: a
    // slow machine segments less often and keeps sending frames.
    if (segmented !== null) cap.mark(segmented, deps.now() - segmented);
    counters.drawMs += drawn - started;
    counters.captureMs += captured - drawn;
    counters.sendMs += deps.now() - captured;
    counters.frames += 1;
    if (first) {
      first = false;
      deps.onFirstFrame();
    }
  };

  /** The camera's stream ended: wait for the next one. */
  const nextInput = (): Promise<void> =>
    new Promise((resolve) => {
      inputChanged = resolve;
    });

  // Read through a call: `stopped` changes while a read is pending.
  const running = (): boolean => !stopped;

  const loop = async (): Promise<void> => {
    while (running()) {
      const current = reader;
      const result = await current.read().catch((error: unknown) => {
        if (current !== reader || !running()) return { done: true } as const;
        throw error;
      });
      if (result.done) {
        if (current === reader && running()) await nextInput();
        continue;
      }
      try {
        if (running()) await process(result.value);
      } finally {
        result.value.close();
      }
    }
  };

  let failed = false;
  const fail = (error: unknown): void => {
    if (failed || stopped) return;
    failed = true;
    stopped = true;
    deps.onError(error);
  };

  const done = loop().catch(fail);

  return {
    setInput(input) {
      const old = reader;
      reader = input.getReader();
      old.cancel().catch(() => undefined);
      inputChanged();
    },
    setStrength(next) {
      strength = next;
    },
    setImage(next) {
      image = next;
      imageFor = "";
      if (!next) deps.compositor.setImage(null);
    },
    setSegmenter(next) {
      const old = segmenter;
      segmenter = next;
      deps.smoother.reset();
      old.close();
    },
    stats: () => ({ ...counters }),
    async stop() {
      stopped = true;
      inputChanged();
      await reader.cancel().catch(() => undefined);
      await done;
      writer.releaseLock();
    },
  };
}
