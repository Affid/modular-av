import { audioEffectContract } from "@modular-av/testing/contract/audio-effects";
import { tailEffectContract } from "@modular-av/testing/contract/tail-effects";

audioEffectContract({
  modules: "audio-radio",
  effects: ["radio"],
  brokenFiles: "worklets/radio",
});

tailEffectContract({ modules: "audio-radio", effects: ["radio"] });
