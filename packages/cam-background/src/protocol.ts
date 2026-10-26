/**
 * Messages between the effect on the page (the host) and the worker that
 * segments and draws. Streams and images are transferred, not copied.
 */
import type { Mode, PipelineStats } from "./pipeline/pipeline.ts";
import type { Quality } from "./settings.ts";

/** The models' URLs, by quality. */
export type ModelUrls = Readonly<Record<Quality, string>>;

/** MediaPipe's WASM runtime, as URLs the worker can fetch. */
export interface RuntimeFiles {
  readonly loader: string;
  readonly wasm: string;
}

export type ToWorker =
  | {
      readonly type: "start";
      readonly files: RuntimeFiles;
      readonly models: ModelUrls;
      /** High falls back to standard where WebGL runs in software. */
      readonly quality: Quality;
      readonly mode: Mode;
      readonly strength: number;
      readonly image: ImageBitmap | null;
      readonly input: ReadableStream<VideoFrame>;
      readonly output: WritableStream<VideoFrame>;
    }
  | { readonly type: "input"; readonly input: ReadableStream<VideoFrame> }
  | { readonly type: "strength"; readonly value: number }
  | { readonly type: "image"; readonly image: ImageBitmap | null }
  | { readonly type: "quality"; readonly quality: Quality }
  | { readonly type: "stats"; readonly id: number }
  | { readonly type: "stop" };

/** An error, as plain data: what a UI shows is its name. */
export interface ErrorData {
  readonly name: string;
  readonly message: string;
}

export type FromWorker =
  /** The first processed frame was sent: the effect runs. */
  | { readonly type: "first-frame" }
  /** It stopped working: no more frames come. */
  | { readonly type: "error"; readonly error: ErrorData }
  /** Another quality couldn't start: the old one goes on. */
  | { readonly type: "model-error"; readonly error: ErrorData }
  /** The quality running, and whether software WebGL forced standard. */
  | {
      readonly type: "quality";
      readonly quality: Quality;
      readonly software: boolean;
    }
  | {
      readonly type: "stats";
      readonly id: number;
      readonly stats: PipelineStats;
    }
  | { readonly type: "stopped" };

export function errorData(error: unknown): ErrorData {
  if (error instanceof Error || error instanceof DOMException)
    return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

/** An error the worker reported, rebuilt on the page with its name. */
export class WorkerError extends Error {
  constructor(data: ErrorData) {
    super(data.message);
    this.name = data.name;
  }
}

/** Where the host's messages go: a worker, or (to measure) this thread. */
export interface Port {
  post(message: ToWorker, transfer?: Transferable[]): void;
  onMessage(listener: (message: FromWorker) => void): void;
  /** The worker itself failed (an uncaught error, or it couldn't load). */
  onCrash(listener: (error: Error) => void): void;
  terminate(): void;
}
