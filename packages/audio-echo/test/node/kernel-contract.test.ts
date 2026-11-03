import { kernelContract } from "@modular-av/testing/contract/kernels";

kernelContract({
  file: new URL("../../public/worklets/echo.js", import.meta.url),
  name: "modular-av-audio-echo",
  options: { time: 0.3, decay: 1.5 },
  configure: [
    { time: 0.05, decay: 3 },
    { time: 0.6, decay: 0.3 },
  ],
});
