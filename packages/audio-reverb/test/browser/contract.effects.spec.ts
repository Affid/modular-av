import { audioEffectContract } from "@modular-av/testing/contract/audio-effects";
import { tailEffectContract } from "@modular-av/testing/contract/tail-effects";

audioEffectContract({
  modules: "audio-reverb",
  effects: ["reverb"],
  brokenFiles: "worklets/reverb",
});

tailEffectContract({ modules: "audio-reverb", effects: ["reverb"] });
