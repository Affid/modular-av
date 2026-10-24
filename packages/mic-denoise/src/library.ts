// The model code itself: @sapphi-red/web-noise-suppressor defines its
// node classes on load (they extend AudioWorkletNode), so this lazy chunk
// is imported only in a browser, when a model is turned on.
import {
  GtcrnWorkletNode,
  loadGtcrn,
  loadRnnoise,
  loadSpeex,
  RnnoiseWorkletNode,
  SpeexWorkletNode,
} from "@sapphi-red/web-noise-suppressor";
import { createRuntime, type ModelLibrary } from "./runtime.ts";

/** The library's loaders don't check the response: a 404 page isn't WASM. */
function checked(binary: ArrayBuffer): ArrayBuffer {
  if (!WebAssembly.validate(binary))
    throw new WebAssembly.CompileError("The model file is not WebAssembly");
  return binary;
}

export const LIBRARY: ModelLibrary = {
  async loadWasm(spec, url) {
    if (spec.simdWasm)
      return checked(
        await loadRnnoise({ url: url(spec.wasm), simdUrl: url(spec.simdWasm) }),
      );
    return checked(
      spec.id === "speex"
        ? await loadSpeex({ url: url(spec.wasm) })
        : await loadGtcrn({ url: url(spec.wasm) }),
    );
  },
  createNode(spec, context, wasmBinary) {
    const options = { wasmBinary, maxChannels: 1 };
    if (spec.id === "rnnoise") return new RnnoiseWorkletNode(context, options);
    if (spec.id === "speex") return new SpeexWorkletNode(context, options);
    return new GtcrnWorkletNode(context, options);
  },
};

/** The page's runtime: WASM downloads are shared by every capture context. */
export const runtime = createRuntime(LIBRARY);
