// The worker's entry (a module worker): MediaPipe and the pipeline run
// here, off the page's main thread. The host sends a "start" with the
// camera's frames and the output's sink.
import { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { ToWorker } from "../protocol.ts";
import { createRuntime } from "./runtime.ts";

const runtime = createRuntime({ ImageSegmenter }, (message) => {
  self.postMessage(message);
});

self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  runtime.handle(event.data);
});
