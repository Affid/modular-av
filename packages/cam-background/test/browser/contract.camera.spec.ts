import { videoEffectContract } from "@modular-av/testing/contract/video-effects";

// Headless Chromium draws WebGL in software here: about 12 fps (handoff §16).
videoEffectContract({
  modules: "cam-background",
  effects: ["background-blur", "background-replace"],
  brokenFiles: "models/",
  worker: "/modules/modular-av-cam-background/worker.js",
  minFps: 5,
});
