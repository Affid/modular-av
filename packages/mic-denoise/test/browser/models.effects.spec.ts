import { audioEffectContract } from "@modular-av/testing/contract/audio-effects";

audioEffectContract({
  modules: "mic-denoise",
  effects: ["rnnoise", "speex", "gtcrn"],
  brokenFiles: "models/",
});
