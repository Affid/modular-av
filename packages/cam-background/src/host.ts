import type { EffectContext, VideoEffect } from "@modular-av/api";
import { ImageLoadError } from "./errors.ts";
import type { Mode, PipelineStats } from "./pipeline/pipeline.ts";
import type { Quality } from "./settings.ts";
import {
  type FromWorker,
  type ModelUrls,
  type Port,
  type RuntimeFiles,
  type ToWorker,
  WorkerError,
} from "./protocol.ts";

/** The parts of the insertable streams API (Chromium) the host uses. */
export interface Insertable {
  readonly Processor: new (init: { track: MediaStreamTrack }) => {
    readonly readable: ReadableStream<VideoFrame>;
  };
  readonly Generator: new (init: { kind: "video" }) => MediaStreamTrack & {
    readonly writable: WritableStream<VideoFrame>;
  };
}

/** Nothing came out in time: MediaPipe didn't start, or the GPU is too slow. */
export const START_TIMEOUT_MS = 30_000;
/** How long a stopping worker may take to let go before it is ended. */
const STOP_GRACE_MS = 2_000;
/**
 * A running worker is asked this often whether it is alive; one that
 * closed itself or hangs sends no error, only silence.
 */
export const PING_EVERY_MS = 2_000;
/** Silent this long: it is taken as dead (a slow frame takes seconds at most). */
export const DEAD_AFTER_MS = 6_000;

export interface HostOptions {
  readonly connect: () => Port;
  readonly insertable: Insertable;
  readonly files: RuntimeFiles;
  readonly mode: Mode;
  readonly models: ModelUrls;
  readonly quality: Quality;
  readonly strength: number;
  /** Replacing: the image's URL. */
  readonly image: string | null;
  readonly loadImage: (url: string) => Promise<ImageBitmap>;
  readonly context: EffectContext;
  readonly startTimeoutMs?: number;
}

/** A running background effect, as its settings change it. */
export interface BackgroundEffect extends VideoEffect {
  setStrength(strength: number): void;
  /** Keeps the old image if the new one can't load (and rejects). */
  setImage(url: string): Promise<void>;
  setQuality(quality: Quality): void;
  stats(): Promise<PipelineStats>;
}

/** Decodes an image on this thread (SVG too), for the worker. */
export async function decodeImage(url: string): Promise<ImageBitmap> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } catch (error: unknown) {
    throw new ImageLoadError(`The background image couldn't load: ${url}`, {
      cause: error,
    });
  }
}

const abortError = (): DOMException =>
  new DOMException("The camera background was turned off", "AbortError");

/**
 * The effect on the page: hands the camera's frames to the worker as a
 * stream and gives the core the worker's output track. The page does no
 * work per frame.
 */
export function createHost(options: HostOptions): BackgroundEffect {
  const { context } = options;
  let port: Port | null = null;
  let generator: InstanceType<Insertable["Generator"]> | null = null;
  let started = false;
  let disposed = false;
  let nextStats = 0;
  let nextPing = 0;
  let lastAnswer = 0;
  let pinging: ReturnType<typeof setInterval> | undefined;
  const statsWaiting = new Map<number, (stats: PipelineStats) => void>();
  let onStartMessage: (message: FromWorker | Error) => void = () => undefined;

  const post = (message: ToWorker, transfer: Transferable[] = []): void => {
    port?.post(message, transfer);
  };

  const failed = (error: Error): void => {
    if (!started) onStartMessage(error);
    else if (!disposed) context.fail(error);
  };

  const listen = (p: Port): void => {
    p.onMessage((message) => {
      lastAnswer = Date.now();
      if (message.type === "stats") {
        statsWaiting.get(message.id)?.(message.stats);
        statsWaiting.delete(message.id);
      } else if (message.type === "error") {
        failed(new WorkerError(message.error));
      } else if (message.type === "first-frame") {
        onStartMessage(message);
      }
    });
    p.onCrash(failed);
  };

  const firstFrame = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        onStartMessage(
          new DOMException(
            "The camera background didn't start",
            "TimeoutError",
          ),
        );
      }, options.startTimeoutMs ?? START_TIMEOUT_MS);
      const onAbort = (): void => {
        onStartMessage(abortError());
      };
      context.signal.addEventListener("abort", onAbort);
      onStartMessage = (message) => {
        clearTimeout(timer);
        context.signal.removeEventListener("abort", onAbort);
        onStartMessage = () => undefined;
        if (message instanceof Error) reject(message);
        else resolve();
      };
    });

  const watchAlive = (): void => {
    lastAnswer = Date.now();
    pinging = setInterval(() => {
      if (Date.now() - lastAnswer <= DEAD_AFTER_MS) {
        post({ type: "ping", id: (nextPing += 1) });
        return;
      }
      clearInterval(pinging);
      failed(
        new WorkerError({
          name: "WorkerError",
          message: "The camera background's worker stopped answering",
        }),
      );
    }, PING_EVERY_MS);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearInterval(pinging);
    const current = port;
    port = null;
    if (current) {
      const end = setTimeout(() => {
        current.terminate();
      }, STOP_GRACE_MS);
      current.onMessage((message) => {
        if (message.type !== "stopped") return;
        clearTimeout(end);
        current.terminate();
      });
      current.post({ type: "stop" });
    }
    generator?.stop();
    generator = null;
  };

  return {
    async start(input) {
      context.signal.throwIfAborted();
      const image =
        options.mode === "replace" && options.image
          ? await options.loadImage(options.image)
          : null;
      context.signal.throwIfAborted();
      const p = options.connect();
      port = p;
      listen(p);
      const output = new options.insertable.Generator({ kind: "video" });
      generator = output;
      const processor = new options.insertable.Processor({ track: input });
      const running = firstFrame();
      post(
        {
          type: "start",
          files: options.files,
          models: options.models,
          quality: options.quality,
          mode: options.mode,
          strength: options.strength,
          image,
          input: processor.readable,
          output: output.writable,
        },
        [processor.readable, output.writable, ...(image ? [image] : [])],
      );
      try {
        await running;
      } catch (error: unknown) {
        dispose();
        throw error;
      }
      started = true;
      watchAlive();
      return output;
    },
    replaceInput(input) {
      const processor = new options.insertable.Processor({ track: input });
      post({ type: "input", input: processor.readable }, [processor.readable]);
      return Promise.resolve();
    },
    setStrength(strength) {
      post({ type: "strength", value: strength });
    },
    async setImage(url) {
      const image = await options.loadImage(url);
      if (disposed) {
        image.close();
        return;
      }
      post({ type: "image", image }, [image]);
    },
    setQuality(quality) {
      post({ type: "quality", quality });
    },
    stats() {
      const id = (nextStats += 1);
      return new Promise((resolve) => {
        statsWaiting.set(id, resolve);
        post({ type: "stats", id });
      });
    },
    dispose,
  };
}

/** A module worker at `url`, as the host's port. */
export function workerPort(url: string): Port {
  const worker = new Worker(url, { type: "module" });
  return {
    post: (message, transfer = []) => {
      worker.postMessage(message, transfer);
    },
    onMessage(listener) {
      worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
        listener(event.data);
      });
    },
    onCrash(listener) {
      const crashed = (event: Event): void => {
        const message =
          event instanceof ErrorEvent && event.message
            ? event.message
            : "The camera background's worker stopped";
        listener(new WorkerError({ name: "WorkerError", message }));
      };
      worker.addEventListener("error", crashed);
      worker.addEventListener("messageerror", crashed);
    },
    terminate: () => {
      worker.terminate();
    },
  };
}
