import { audioEffectContract } from "@modular-av/testing/contract/audio-effects";
import { tailEffectContract } from "@modular-av/testing/contract/tail-effects";

audioEffectContract({
  modules: "audio-echo",
  effects: ["echo"],
  brokenFiles: "worklets/echo",
});

tailEffectContract({ modules: "audio-echo", effects: ["echo"] });
