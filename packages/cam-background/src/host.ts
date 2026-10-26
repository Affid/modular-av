import type { EffectContext, VideoEffect } from "@modular-av/api";
import { ImageLoadError } from "./errors.ts";
import { type Liveness, watchLiveness } from "./liveness.ts";
import type { Mode, PipelineStats } from "./pipeline/pipeline.ts";
import {
  type FromWorker,
  type ModelUrls,
  type Port,
  type RuntimeFiles,
  type ToWorker,
  WorkerError,
} from "./protocol.ts";
import type { Quality } from "./settings.ts";

export { DEAD_AFTER_MS, PING_EVERY_MS } from "./liveness.ts";

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
  /** What it survives: another quality that couldn't start. */
  readonly onError?: (error: unknown) => void;
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
    image.referrerPolicy = "no-referrer";
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

/** Resolves once the first frame is out; rejects on an error, abort or timeout. */
function firstFrame(
  options: HostOptions,
  listen: (settle: (message: FromWorker | Error) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { signal } = options.context;
    const settle = (message: FromWorker | Error): void => {
      if (!(message instanceof Error) && message.type !== "first-frame") return;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      listen(() => undefined);
      if (message instanceof Error) reject(message);
      else resolve();
    };
    const onAbort = (): void => {
      settle(abortError());
    };
    const timer = setTimeout(() => {
      settle(
        new DOMException("The camera background didn't start", "TimeoutError"),
      );
    }, options.startTimeoutMs ?? START_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort);
    listen(settle);
  });
}

/** Stops the worker, ending it if it doesn't answer in time. */
function stopWorker(port: Port): void {
  const end = setTimeout(() => {
    port.terminate();
  }, STOP_GRACE_MS);
  port.onMessage((message) => {
    if (message.type !== "stopped") return;
    clearTimeout(end);
    port.terminate();
  });
  port.post({ type: "stop" });
}

/** Latest-wins image changes: one decoded late, after a newer pick, is dropped. */
function imageChanges(
  options: HostOptions,
  post: (image: ImageBitmap) => boolean,
): (url: string) => Promise<void> {
  let latest = 0;
  return async (url) => {
    const asked = (latest += 1);
    const image = await options.loadImage(url);
    if (asked !== latest || !post(image)) image.close();
  };
}

interface HostState {
  port: Port | null;
  generator: InstanceType<Insertable["Generator"]> | null;
  liveness: Liveness | null;
  onStart: (message: FromWorker | Error) => void;
  disposed: boolean;
  nextStats: number;
  readonly statsWaiting: Map<
    number,
    { resolve: (stats: PipelineStats) => void; reject: (error: Error) => void }
  >;
}

const postTo = (
  state: HostState,
  message: ToWorker,
  transfer: Transferable[] = [],
): boolean => {
  if (!state.port || state.disposed) return false;
  state.port.post(message, transfer);
  return true;
};

/** Before it runs, a failure fails the start; after, the effect. */
const failWith =
  (state: HostState, context: EffectContext) =>
  (error: Error): void => {
    if (!state.liveness) state.onStart(error);
    else if (!state.disposed) context.fail(error);
  };

function onWorkerMessage(
  state: HostState,
  options: HostOptions,
  message: FromWorker,
): void {
  state.liveness?.heard();
  if (message.type === "stats") {
    state.statsWaiting.get(message.id)?.resolve(message.stats);
    state.statsWaiting.delete(message.id);
  } else if (message.type === "error")
    failWith(state, options.context)(new WorkerError(message.error));
  else if (message.type === "model-error")
    options.onError?.(new WorkerError(message.error));
  state.onStart(message);
}

function disposeHost(state: HostState): void {
  if (state.disposed) return;
  state.disposed = true;
  state.liveness?.stop();
  for (const waiting of state.statsWaiting.values())
    waiting.reject(abortError());
  state.statsWaiting.clear();
  if (state.port) stopWorker(state.port);
  state.port = null;
  state.generator?.stop();
  state.generator = null;
}

/** Sends the worker what it starts with; the streams and image are transferred. */
function postStart(
  state: HostState,
  options: HostOptions,
  parts: {
    readonly input: MediaStreamTrack;
    readonly output: InstanceType<Insertable["Generator"]>;
    readonly image: ImageBitmap | null;
  },
): void {
  const processor = new options.insertable.Processor({ track: parts.input });
  const { image, output } = parts;
  postTo(
    state,
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
}

/** Hands the worker the camera; resolves with its output once a frame is out. */
async function startHost(
  state: HostState,
  options: HostOptions,
  input: MediaStreamTrack,
): Promise<MediaStreamTrack> {
  const { context } = options;
  context.signal.throwIfAborted();
  const image =
    options.mode === "replace" && options.image
      ? await options.loadImage(options.image)
      : null;
  if (context.signal.aborted) {
    image?.close();
    throw abortError();
  }
  const port = options.connect();
  state.port = port;
  port.onMessage((message) => {
    onWorkerMessage(state, options, message);
  });
  port.onCrash(failWith(state, context));
  const output = new options.insertable.Generator({ kind: "video" });
  state.generator = output;
  const running = firstFrame(options, (settle) => {
    state.onStart = settle;
  });
  postStart(state, options, { input, output, image });
  try {
    await running;
  } catch (error: unknown) {
    disposeHost(state);
    throw error;
  }
  state.liveness = watchLiveness(
    (id) => postTo(state, { type: "ping", id }),
    failWith(state, context),
  );
  return output;
}

function statsOf(state: HostState): Promise<PipelineStats> {
  const id = (state.nextStats += 1);
  return new Promise((resolve, reject) => {
    state.statsWaiting.set(id, { resolve, reject });
    if (!postTo(state, { type: "stats", id })) {
      state.statsWaiting.delete(id);
      reject(abortError());
    }
  });
}

/**
 * The effect on the page: hands the camera's frames to the worker as a
 * stream and gives the core the worker's output track. The page does no
 * work per frame.
 */
export function createHost(options: HostOptions): BackgroundEffect {
  const state: HostState = {
    port: null,
    generator: null,
    liveness: null,
    onStart: () => undefined,
    disposed: false,
    nextStats: 0,
    statsWaiting: new Map(),
  };
  return {
    start: (input) => startHost(state, options, input),
    replaceInput(input) {
      if (state.disposed) return Promise.resolve();
      const processor = new options.insertable.Processor({ track: input });
      postTo(state, { type: "input", input: processor.readable }, [
        processor.readable,
      ]);
      return Promise.resolve();
    },
    setStrength(strength) {
      postTo(state, { type: "strength", value: strength });
    },
    setImage: imageChanges(options, (image) =>
      postTo(state, { type: "image", image }, [image]),
    ),
    setQuality(quality) {
      postTo(state, { type: "quality", quality });
    },
    stats: () => statsOf(state),
    dispose: () => {
      disposeHost(state);
    },
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
