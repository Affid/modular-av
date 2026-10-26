import { createCompositor } from "../pipeline/compositor.ts";
import { createFullScreen } from "../pipeline/gl.ts";
import { createMaskSmoother } from "../pipeline/mask-smoother.ts";
import {
  type Pipeline,
  type PipelineDeps,
  startPipeline,
} from "../pipeline/pipeline.ts";
import type { Segmenter } from "../pipeline/segmenter.ts";
import type { ModelUrls, RuntimeFiles, ToWorker } from "../protocol.ts";

/** WebGL2 isn't available on this canvas (no GPU process, blocked). */
export class WebGLUnavailableError extends Error {
  override readonly name = "WebGLUnavailableError";
}

/** The GPU dropped the context (a driver reset, too much memory). */
export class ContextLostError extends Error {
  override readonly name = "ContextLostError";
}

export type Start = Extract<ToWorker, { type: "start" }>;

/** One effect's pipeline in the worker, and what it holds. */
export interface Session {
  readonly pipeline: Pipeline<VideoFrame, ImageBitmap>;
  readonly files: RuntimeFiles;
  readonly models: ModelUrls;
  readonly canvas: OffscreenCanvas;
  dispose(): Promise<void>;
}

export interface SessionDeps {
  readonly onFirstFrame: () => void;
  readonly onError: (error: unknown) => void;
}

const scaleImage = (
  image: ImageBitmap,
  crop: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): Promise<ImageBitmap> =>
  createImageBitmap(image, crop.x, crop.y, crop.width, crop.height, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });

const release = (image: ImageBitmap | TexImageSource): void => {
  if (image instanceof ImageBitmap) image.close();
};

/** The pipeline's ties to the worker: its canvas, clock and bitmaps. */
function pipelineDeps(
  canvas: OffscreenCanvas,
  parts: Pick<PipelineDeps<VideoFrame, ImageBitmap>, "compositor" | "smoother">,
  deps: SessionDeps,
): PipelineDeps<VideoFrame, ImageBitmap> {
  return {
    canvas,
    ...parts,
    now: () => performance.now(),
    capture: (timestamp) => new VideoFrame(canvas, { timestamp }),
    scaleImage,
    imageSize: (image) => ({ width: image.width, height: image.height }),
    releaseImage: release,
    onFirstFrame: deps.onFirstFrame,
    onError: deps.onError,
  };
}

/**
 * Starts the pipeline on `canvas`, whose WebGL context MediaPipe made for
 * `segmenter`. If any part can't be made, what was made is let go.
 */
export function startSession(
  message: Start,
  canvas: OffscreenCanvas,
  segmenter: Segmenter,
  deps: SessionDeps,
): Session {
  const undo: (() => void)[] = [
    () => {
      segmenter.close();
    },
  ];
  try {
    // MediaPipe made the context; this is the same one.
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new WebGLUnavailableError("WebGL2 is unavailable");
    canvas.addEventListener("webglcontextlost", () => {
      deps.onError(new ContextLostError("The GPU lost the drawing context"));
    });
    const compositor = createCompositor(gl);
    undo.push(() => {
      compositor.dispose();
    });
    const screen = createFullScreen(gl);
    undo.push(() => {
      screen.dispose();
    });
    const smoother = createMaskSmoother(gl, screen);
    undo.push(() => {
      smoother.dispose();
    });
    const pipeline = startPipeline<VideoFrame, ImageBitmap>(
      pipelineDeps(canvas, { compositor, smoother }, deps),
      { ...message, segmenter },
    );
    return {
      pipeline,
      files: message.files,
      models: message.models,
      canvas,
      async dispose() {
        // Stopping closes the segmenter in use (it may have been swapped).
        await pipeline.stop();
        smoother.dispose();
        screen.dispose();
        compositor.dispose();
      },
    };
  } catch (error: unknown) {
    for (const step of undo.reverse()) step();
    throw error;
  }
}
