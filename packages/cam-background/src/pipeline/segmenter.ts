import type {
  ImageSegmenter,
  ImageSegmenterOptions,
  MPMask,
} from "@mediapipe/tasks-vision";

/** MediaPipe's WASM runtime files (its type isn't exported). */
export type WasmFileset = Parameters<
  typeof ImageSegmenter.createFromOptions
>[0];

/** Which of a model's confidence masks to use, and whether it is the background's. */
export interface MaskChoice {
  readonly index: number;
  readonly invert: boolean;
}

/**
 * A model with a "background" category (the multiclass selfie model)
 * gives the background's confidence; the selfie model one mask, the
 * person's.
 */
export function chooseMask(labels: readonly string[]): MaskChoice {
  const background = labels.map((l) => l.toLowerCase()).indexOf("background");
  if (background >= 0) return { index: background, invert: true };
  return { index: Math.max(0, labels.length - 1), invert: false };
}

/** The model file isn't a TensorFlow Lite model (e.g. an error page). */
export class ModelFileError extends Error {
  override readonly name = "ModelFileError";
}

/** TensorFlow Lite flatbuffers name themselves at bytes 4 to 8. */
export function checkModel(bytes: Uint8Array): Uint8Array {
  const id = String.fromCharCode(...bytes.subarray(4, 8));
  if (id !== "TFL3")
    throw new ModelFileError("The model file is not a TensorFlow Lite model");
  return bytes;
}

/** Fetches a model, failing on an HTTP error or a file that isn't one. */
export async function loadModel(
  url: string,
  fetcher: (url: string) => Promise<Response> = fetch,
): Promise<Uint8Array> {
  const response = await fetcher(url);
  if (!response.ok)
    throw new ModelFileError(
      `The model file couldn't load (HTTP ${String(response.status)})`,
    );
  return checkModel(new Uint8Array(await response.arrayBuffer()));
}

export interface Segmenter {
  /**
   * Segments `frame`; `use` gets the person's (or background's, see
   * `invert`) confidence as a texture of the canvas's context, valid only
   * during the call.
   */
  segment(
    frame: TexImageSource,
    use: (mask: WebGLTexture, width: number, height: number) => void,
  ): void;
  /** The mask is the background's confidence. */
  readonly invert: boolean;
  close(): void;
}

/** The part of MediaPipe used, so tests can stand in for it. */
export interface Vision {
  readonly ImageSegmenter: {
    createFromOptions(
      fileset: WasmFileset,
      options: ImageSegmenterOptions,
    ): Promise<ImageSegmenter>;
  };
}

export interface SegmenterOptions {
  readonly vision: Vision;
  readonly files: WasmFileset;
  readonly model: Uint8Array;
  /** Shared with the compositor, so masks are textures there. */
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  /** Milliseconds on a monotonic clock. */
  readonly now: () => number;
}

async function createWith(
  options: SegmenterOptions,
  delegate: "GPU" | "CPU",
): Promise<ImageSegmenter> {
  return options.vision.ImageSegmenter.createFromOptions(options.files, {
    baseOptions: { modelAssetBuffer: options.model, delegate },
    canvas: options.canvas,
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
}

/** MediaPipe's segmenter on the GPU, or on the CPU where WebGL can't run it. */
export async function createSegmenter(
  options: SegmenterOptions,
): Promise<Segmenter> {
  let segmenter: ImageSegmenter;
  try {
    segmenter = await createWith(options, "GPU");
  } catch (gpuError: unknown) {
    try {
      segmenter = await createWith(options, "CPU");
    } catch (cpuError: unknown) {
      throw new AggregateError(
        [gpuError, cpuError],
        "MediaPipe's segmenter couldn't start",
        { cause: cpuError },
      );
    }
  }
  const choice = chooseMask(segmenter.getLabels());
  // MediaPipe wants timestamps that only go up.
  let last = -Infinity;
  return {
    invert: choice.invert,
    segment(frame, use) {
      const timestamp = Math.max(Math.floor(options.now()), last + 1);
      last = timestamp;
      segmenter.segmentForVideo(frame, timestamp, (result) => {
        const masks: readonly MPMask[] = result.confidenceMasks ?? [];
        const mask = masks[choice.index];
        if (!mask) throw new Error("MediaPipe gave no confidence mask");
        use(mask.getAsWebGLTexture(), mask.width, mask.height);
      });
    },
    close() {
      segmenter.close();
    },
  };
}
