import { effectContract } from "@modular-av/testing/contract/effects";

effectContract({
  modules: "mic-denoise",
  effects: ["rnnoise", "speex", "gtcrn"],
  brokenFiles: "models/",
});
