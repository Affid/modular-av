import {
  createSegmenter,
  loadModel,
  type Segmenter,
  type Vision,
} from "../pipeline/segmenter.ts";
import type { RuntimeFiles } from "../protocol.ts";

/** A segmenter that takes longer than this to start counts as failed. */
export const SEGMENTER_TIMEOUT_MS = 30_000;

export interface Segmenters {
  /** A segmenter on `canvas` for the model at `url` (downloaded once). */
  create(
    files: RuntimeFiles,
    url: string,
    canvas: OffscreenCanvas,
  ): Promise<Segmenter>;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new DOMException("The segmenter didn't start in time", "TimeoutError"),
      );
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** MediaPipe's segmenters, each model's file fetched once per worker. */
export function createSegmenters(
  vision: Vision,
  now: () => number,
  timeoutMs = SEGMENTER_TIMEOUT_MS,
): Segmenters {
  const models = new Map<string, Promise<Uint8Array>>();
  const model = (url: string): Promise<Uint8Array> => {
    const known = models.get(url);
    if (known) return known;
    const loading = loadModel(url);
    models.set(url, loading);
    loading.catch(() => models.delete(url));
    return loading;
  };
  return {
    async create(files, url, canvas) {
      const creating = (async () =>
        createSegmenter({
          vision,
          files: { wasmLoaderPath: files.loader, wasmBinaryPath: files.wasm },
          model: await model(url),
          canvas,
          now,
        }))();
      try {
        return await withTimeout(creating, timeoutMs);
      } catch (error: unknown) {
        // One that starts after all is closed, not left running.
        creating.then(
          (late) => {
            late.close();
          },
          () => undefined,
        );
        throw error;
      }
    },
  };
}
