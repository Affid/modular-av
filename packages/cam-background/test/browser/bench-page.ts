// Loaded into the harness page by the bench (camera.bench.ts): runs the
// background effect on a looping video of the fake camera, in a worker or
// on the page's own thread, so the two can be measured alike.
import { ImageSegmenter } from "@mediapipe/tasks-vision";
import {
  type BackgroundEffect,
  createHost,
  decodeImage,
  type Insertable,
  workerPort,
} from "../../src/host.ts";
import type { Mode } from "../../src/pipeline/pipeline.ts";
import type { FromWorker, Port } from "../../src/protocol.ts";
import { createRuntime } from "../../src/worker/runtime.ts";

const MODULE = "/modules/modular-av-cam-background";
const FILES = {
  loader: `${MODULE}/mediapipe/vision_wasm_module_internal.js`,
  wasm: `${MODULE}/mediapipe/vision_wasm_module_internal.wasm`,
};
const MODELS = {
  standard: `${MODULE}/models/selfie_segmenter.tflite`,
  high: `${MODULE}/models/selfie_multiclass_256x256.tflite`,
};

export type Where = "worker" | "main";
export type Quality = keyof typeof MODELS;

let loads = 0;

/**
 * MediaPipe on the page's thread: its loader would add a classic script,
 * and the module build is ESM, so import it here (anew each time: it sets
 * the global factory once per evaluation) and let MediaPipe find it.
 */
const pageVision = {
  ImageSegmenter: {
    async createFromOptions(
      files: Parameters<typeof ImageSegmenter.createFromOptions>[0],
      options: Parameters<typeof ImageSegmenter.createFromOptions>[1],
    ) {
      loads += 1;
      await import(
        /* @vite-ignore */ `${files.wasmLoaderPath}?load=${String(loads)}`
      );
      return ImageSegmenter.createFromOptions(
        { ...files, wasmLoaderPath: "" },
        options,
      );
    },
  },
};

function pagePort(): Port {
  const listeners: ((message: FromWorker) => void)[] = [];
  const runtime = createRuntime(pageVision, (message) => {
    queueMicrotask(() => {
      for (const listener of listeners) listener(message);
    });
  });
  return {
    post: (message) => {
      runtime.handle(message);
    },
    onMessage: (listener) => {
      listeners.push(listener);
    },
    onCrash: () => undefined,
    terminate: () => undefined,
  };
}

const insertable = globalThis as unknown as {
  MediaStreamTrackProcessor: Insertable["Processor"];
  MediaStreamTrackGenerator: Insertable["Generator"];
};

let camera: HTMLVideoElement | null = null;
let effect: BackgroundEffect | null = null;
const shown = document.createElement("video");
shown.muted = true;
shown.autoplay = true;
shown.width = 640;
shown.height = 480;
shown.id = "bench-output";
document.body.append(shown);

/** The fake camera as a playing video, its track like a webcam's. */
async function cameraTrack(src: string): Promise<MediaStreamTrack> {
  camera?.remove();
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.src = src;
  video.style.width = "64px";
  document.body.append(video);
  camera = video;
  await video.play();
  const stream = (
    video as HTMLVideoElement & { captureStream(): MediaStream }
  ).captureStream();
  const [track] = stream.getVideoTracks();
  if (!track) throw new Error("no video track");
  return track;
}

const longTasks: number[] = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) longTasks.push(entry.duration);
}).observe({ type: "longtask", buffered: false });

export interface BenchApi {
  playCamera(src: string): Promise<void>;
  start(options: {
    where: Where;
    quality: Quality;
    mode: Mode;
    image?: string;
  }): Promise<number>;
  stats(): Promise<unknown>;
  takeLongTasks(): number[];
  stop(): void;
}

let track: MediaStreamTrack | null = null;

const api: BenchApi = {
  async playCamera(src) {
    track = await cameraTrack(src);
  },
  async start({ where, quality, mode, image }) {
    if (!track) throw new Error("no camera");
    const started = performance.now();
    effect = createHost({
      connect: () =>
        where === "worker"
          ? workerPort(
              new URL("../../src/worker/main.ts", import.meta.url).href,
            )
          : pagePort(),
      insertable: {
        Processor: insertable.MediaStreamTrackProcessor,
        Generator: insertable.MediaStreamTrackGenerator,
      },
      files: FILES,
      mode,
      models: MODELS,
      quality,
      strength: 0.5,
      image: image ?? null,
      loadImage: decodeImage,
      context: {
        signal: new AbortController().signal,
        fail: (error) => {
          // eslint-disable-next-line no-console -- the bench reports in the console
          console.error("effect failed", error);
        },
      },
    });
    const output = await effect.start(track);
    shown.srcObject = new MediaStream([output]);
    return performance.now() - started;
  },
  stats: () => effect?.stats() ?? Promise.resolve(null),
  takeLongTasks: () => longTasks.splice(0),
  stop() {
    effect?.dispose();
    effect = null;
    shown.srcObject = null;
  },
};

(window as unknown as { bench: BenchApi }).bench = api;
