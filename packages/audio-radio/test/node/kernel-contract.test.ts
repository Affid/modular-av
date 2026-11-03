import { kernelContract } from "@modular-av/testing/contract/kernels";

kernelContract({
  file: new URL("../../public/worklets/radio.js", import.meta.url),
  name: "modular-av-audio-radio",
  options: { drive: 0.5, static: 0.3, squelch: 0.5 },
  configure: [
    { drive: 1, static: 1, squelch: 1 },
    { drive: 0, static: 0, squelch: 0 },
  ],
});
