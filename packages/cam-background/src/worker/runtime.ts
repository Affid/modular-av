import { createCompositor } from "../pipeline/compositor.ts";
import { createFullScreen } from "../pipeline/gl.ts";
import { createMaskSmoother } from "../pipeline/mask-smoother.ts";
import { type Pipeline, startPipeline } from "../pipeline/pipeline.ts";
import {
  createSegmenter,
  loadModel,
  type Segmenter,
  type Vision,
} from "../pipeline/segmenter.ts";
import {
  errorData,
  type FromWorker,
  type ModelUrls,
  type RuntimeFiles,
  type ToWorker,
} from "../protocol.ts";
import type { Quality } from "../settings.ts";

/** WebGL drawn by the CPU: the high quality model runs at under 1 fps there. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render/i;

/** Whether this thread's WebGL runs in software, from a throwaway context. */
export function softwareWebGL(): boolean {
  const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(
    gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
  );
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return SOFTWARE_RENDERER.test(renderer);
}

/** WebGL2 isn't available on this canvas (no GPU process, blocked). */
export class WebGLUnavailableError extends Error {
  override readonly name = "WebGLUnavailableError";
}

/** The GPU dropped the context (a driver reset, too much memory). */
export class ContextLostError extends Error {
  override readonly name = "ContextLostError";
}

type Start = Extract<ToWorker, { type: "start" }>;

interface Running {
  readonly pipeline: Pipeline<VideoFrame, ImageBitmap>;
  readonly files: RuntimeFiles;
  readonly models: ModelUrls;
  readonly canvas: OffscreenCanvas;
  dispose(): Promise<void>;
}

/**
 * What runs in the worker: one pipeline per effect, started by the host's
 * "start" and fed by its messages. On the page's thread too, to measure
 * the difference (see the bench).
 */
export function createRuntime(
  vision: Vision,
  post: (message: FromWorker) => void,
  isSoftware: () => boolean = softwareWebGL,
): { handle(message: ToWorker): void } {
  let running: Running | null = null;
  let starting: Promise<void> | null = null;
  let stopped = false;
  const models = new Map<string, Promise<Uint8Array>>();

  const model = (url: string): Promise<Uint8Array> => {
    const known = models.get(url);
    if (known) return known;
    const loading = loadModel(url);
    models.set(url, loading);
    loading.catch(() => models.delete(url));
    return loading;
  };

  const segmenterFor = async (
    files: RuntimeFiles,
    url: string,
    canvas: OffscreenCanvas,
  ): Promise<Segmenter> =>
    createSegmenter({
      vision,
      files: { wasmLoaderPath: files.loader, wasmBinaryPath: files.wasm },
      model: await model(url),
      canvas,
      now: () => performance.now(),
    });

  let software: boolean | null = null;
  /** The quality to run: standard where WebGL runs in software. */
  const usable = (quality: Quality): Quality => {
    software ??= isSoftware();
    const used = software ? "standard" : quality;
    post({ type: "quality", quality: used, software: used !== quality });
    return used;
  };

  const fail = (error: unknown): void => {
    post({ type: "error", error: errorData(error) });
  };

  const start = async (message: Start): Promise<void> => {
    const canvas = new OffscreenCanvas(message.image?.width ?? 640, 480);
    const segmenter = await segmenterFor(
      message.files,
      message.models[usable(message.quality)],
      canvas,
    );
    // MediaPipe made the context; this is the same one.
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      segmenter.close();
      throw new WebGLUnavailableError("WebGL2 is unavailable");
    }
    canvas.addEventListener("webglcontextlost", () => {
      fail(new ContextLostError("The GPU lost the drawing context"));
    });
    const compositor = createCompositor(gl);
    const screen = createFullScreen(gl);
    const smoother = createMaskSmoother(gl, screen);
    const pipeline = startPipeline<VideoFrame, ImageBitmap>(
      {
        canvas,
        compositor,
        smoother,
        now: () => performance.now(),
        capture: (timestamp) => new VideoFrame(canvas, { timestamp }),
        scaleImage: (image, crop, width, height) =>
          createImageBitmap(image, crop.x, crop.y, crop.width, crop.height, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: "high",
          }),
        imageSize: (image) => ({ width: image.width, height: image.height }),
        onFirstFrame: () => {
          post({ type: "first-frame" });
        },
        onError: fail,
      },
      {
        mode: message.mode,
        strength: message.strength,
        image: message.image,
        segmenter,
        input: message.input,
        output: message.output,
      },
    );
    running = {
      pipeline,
      files: message.files,
      models: message.models,
      canvas,
      async dispose() {
        await pipeline.stop();
        segmenter.close();
        smoother.dispose();
        screen.dispose();
        compositor.dispose();
      },
    };
  };

  const swapModel = async (quality: Quality): Promise<void> => {
    const current = running;
    if (!current) return;
    try {
      const next = await segmenterFor(
        current.files,
        current.models[usable(quality)],
        current.canvas,
      );
      if (running === current) current.pipeline.setSegmenter(next);
      else next.close();
    } catch (error: unknown) {
      post({ type: "model-error", error: errorData(error) });
    }
  };

  const stop = async (): Promise<void> => {
    stopped = true;
    await starting?.catch(() => undefined);
    await running?.dispose();
    running = null;
    post({ type: "stopped" });
  };

  /** Messages that came while it starts apply once it runs. */
  const whenStarted = (apply: (current: Running) => void): void => {
    void (starting ?? Promise.resolve()).then(() => {
      if (running && !stopped) apply(running);
    });
  };

  return {
    handle(message) {
      if (message.type === "ping") {
        post({ type: "pong", id: message.id });
        return;
      }
      if (stopped) return;
      switch (message.type) {
        case "start":
          starting = start(message).catch(fail);
          return;
        case "input":
          whenStarted((r) => {
            r.pipeline.setInput(message.input);
          });
          return;
        case "strength":
          whenStarted((r) => {
            r.pipeline.setStrength(message.value);
          });
          return;
        case "image":
          whenStarted((r) => {
            r.pipeline.setImage(message.image);
          });
          return;
        case "quality":
          whenStarted(() => {
            void swapModel(message.quality);
          });
          return;
        case "stats":
          post({
            type: "stats",
            id: message.id,
            stats: running?.pipeline.stats() ?? {
              frames: 0,
              segmentations: 0,
              segmentMs: 0,
              drawMs: 0,
              captureMs: 0,
              sendMs: 0,
              dropped: 0,
            },
          });
          return;
        case "stop":
          stop().catch(fail);
          return;
      }
    },
  };
}
