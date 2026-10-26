import {
  type BackgroundImage,
  createBackgroundImage,
} from "./background-image.ts";
import type { Compositor } from "./compositor.ts";
import { startFrameLoop } from "./frame-loop.ts";
import type { MaskSmoother } from "./mask-smoother.ts";
import { blurRadius, type Crop } from "./math.ts";
import { createSegmentation, type Segmentation } from "./segmentation.ts";
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
    crop: Crop,
    width: number,
    height: number,
  ) => Promise<TexImageSource>;
  readonly imageSize: (image: I) => { width: number; height: number };
  /** Frees an image (a decoded bitmap) no longer needed. */
  readonly releaseImage?: (image: I | TexImageSource) => void;
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
  /** Stops reading and closes the segmenter in use. */
  stop(): Promise<void>;
}

export interface PipelineStart<F, I> {
  readonly mode: Mode;
  readonly strength: number;
  readonly image: I | null;
  readonly segmenter: Segmenter;
  readonly input: ReadableStream<F>;
  readonly output: WritableStream<F>;
}

interface Timings {
  frames: number;
  drawMs: number;
  captureMs: number;
  sendMs: number;
  dropped: number;
}

interface Drawing<F extends FrameLike> {
  readonly deps: PipelineDeps<F, unknown>;
  readonly mode: Mode;
  readonly strength: () => number;
  readonly writer: WritableStreamDefaultWriter<F>;
  readonly timings: Timings;
}

/** Draws `frame` with `mask` into the canvas and sends the result. */
async function drawAndSend<F extends FrameLike>(
  frame: F,
  mask: WebGLTexture,
  drawing: Drawing<F>,
): Promise<void> {
  const { deps, timings } = drawing;
  const width = frame.displayWidth;
  const height = frame.displayHeight;
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
    drawing.mode === "blur"
      ? { mode: "blur", radius: blurRadius(drawing.strength()) }
      : { mode: "replace" },
    mask,
  );
  const drawn = deps.now();
  const out = deps.capture(frame.timestamp);
  const captured = deps.now();
  try {
    await drawing.writer.write(out);
  } finally {
    out.close();
  }
  timings.drawMs += drawn - started;
  timings.captureMs += captured - drawn;
  timings.sendMs += deps.now() - captured;
  timings.frames += 1;
}

/** What happens to each frame: segment, fit the image, draw and send. */
function frameProcessor<F extends FrameLike, I>(
  deps: PipelineDeps<F, I>,
  mode: Mode,
  parts: {
    readonly segmentation: Segmentation<F>;
    readonly image: BackgroundImage<I>;
    readonly drawing: Drawing<F>;
    readonly timings: Timings;
  },
): (frame: F) => Promise<void> {
  const { segmentation, image, drawing, timings } = parts;
  return async (frame) => {
    const segmented = segmentation.segment(frame, deps.now());
    const mask = deps.smoother.texture;
    image.fit(frame.displayWidth, frame.displayHeight);
    if (!mask || (mode === "replace" && !deps.compositor.hasImage)) {
      timings.dropped += 1;
      return;
    }
    await drawAndSend(frame, mask, drawing);
    if (segmented !== null) segmentation.sent(segmented, deps.now());
    if (timings.frames === 1) deps.onFirstFrame();
  };
}

const statsOf = (
  timings: Timings,
  segmentation: Segmentation<unknown>,
): PipelineStats => ({
  ...timings,
  segmentations: segmentation.segmentations,
  segmentMs: segmentation.segmentMs,
});

/** The pipeline's parts that hold state: timings, segmentation, image. */
function pipelineParts<F extends FrameLike, I>(
  deps: PipelineDeps<F, I>,
  start: PipelineStart<F, I>,
  fail: (error: unknown) => void,
): {
  readonly timings: Timings;
  readonly segmentation: Segmentation<F>;
  readonly image: BackgroundImage<I>;
} {
  return {
    timings: { frames: 0, drawMs: 0, captureMs: 0, sendMs: 0, dropped: 0 },
    segmentation: createSegmentation(
      start.segmenter,
      deps.smoother,
      deps.now,
      deps.segmentRate ?? SEGMENT_RATE,
    ),
    image: createBackgroundImage(start.image, {
      compositor: deps.compositor,
      scale: deps.scaleImage,
      size: deps.imageSize,
      ...(deps.releaseImage ? { release: deps.releaseImage } : {}),
      onError: fail,
    }),
  };
}

/**
 * Reads the camera's frames, segments them at a capped rate and sends each
 * one drawn with the latest mask. It never sends a frame without a mask
 * (or, replacing, without the image): fail closed.
 */
export function startPipeline<F extends FrameLike, I>(
  deps: PipelineDeps<F, I>,
  start: PipelineStart<F, I>,
): Pipeline<F, I> {
  let strength = start.strength;
  let failed = false;
  const fail = (error: unknown): void => {
    if (failed) return;
    failed = true;
    void loop.stop();
    deps.onError(error);
  };
  const { timings, segmentation, image } = pipelineParts(deps, start, fail);
  const writer = start.output.getWriter();
  const drawing: Drawing<F> = {
    ...{ deps: deps as PipelineDeps<F, unknown>, mode: start.mode },
    ...{ strength: () => strength, writer, timings },
  };

  const process = frameProcessor(deps, start.mode, {
    segmentation,
    image,
    drawing,
    timings,
  });

  const loop = startFrameLoop(start.input, process, fail);

  return {
    setInput: (input) => {
      loop.setInput(input);
    },
    setStrength(next) {
      strength = next;
    },
    setImage: (next) => {
      image.set(next);
    },
    setSegmenter: (next) => {
      segmentation.setSegmenter(next);
    },
    stats: () => statsOf(timings, segmentation),
    async stop() {
      await loop.stop();
      writer.releaseLock();
      segmentation.close();
      image.close();
    },
  };
}
