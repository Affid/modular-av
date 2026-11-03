import { kernelContract } from "@modular-av/testing/contract/kernels";

kernelContract({
  file: new URL("../../public/worklets/reverb.js", import.meta.url),
  name: "modular-av-audio-reverb",
  options: { decay: 1.5, brightness: 0.5 },
  configure: [
    { decay: 3, brightness: 1 },
    { decay: 0.3, brightness: 0 },
  ],
});
