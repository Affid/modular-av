/** The files this module serves (`modularAV.assets` and `.downloads`). */
export const FILES = {
  loader: "mediapipe/vision_wasm_module_internal.js",
  wasm: "mediapipe/vision_wasm_module_internal.wasm",
  worker: "worker.js",
  standard: "models/selfie_segmenter.tflite",
  high: "models/selfie_multiclass_256x256.tflite",
} as const;
