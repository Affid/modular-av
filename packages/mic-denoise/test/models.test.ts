import { describe, expect, it, vi } from "vitest";
import { canRunWorklets, createModelDefinition } from "../src/definition.ts";
import { MODELS } from "../src/models.ts";
import { createRuntime } from "../src/runtime.ts";
import { fakeContext, fakeLibrary, spec, url } from "./fakes.ts";

describe("the noise models offered", () => {
  it("are three denoise effects of the noise-suppression group, RNNoise first", () => {
    const definitions = MODELS.map((m) =>
      createModelDefinition(m, {
        assetUrl: url,
        loadRuntime: () => Promise.reject(new Error("not loaded")),
      }),
    );

    expect(
      definitions.map((d) => [d.id, d.kind, d.stage, d.exclusiveGroup, d.cost]),
    ).toEqual([
      ["rnnoise", "audio", "denoise", "noise-suppression", "light"],
      ["speex", "audio", "denoise", "noise-suppression", "light"],
      ["gtcrn", "audio", "denoise", "noise-suppression", "medium"],
    ]);
    expect(definitions[0]?.label).toBe("modular-av-mic-denoise.models.rnnoise");
  });

  it("need AudioWorklet and WebAssembly in a secure context", () => {
    const full = {
      AudioWorkletNode: vi.fn(),
      WebAssembly: { instantiate: () => undefined },
      isSecureContext: true,
    };

    expect(canRunWorklets(full)).toBe(true);
    expect(canRunWorklets({ ...full, AudioWorkletNode: undefined })).toBe(
      false,
    );
    expect(canRunWorklets({ ...full, WebAssembly: undefined })).toBe(false);
    expect(canRunWorklets({ ...full, isSecureContext: false })).toBe(false);
  });

  it("load their code only when one is turned on", async () => {
    const loadRuntime = vi.fn(() =>
      Promise.resolve(createRuntime(fakeLibrary().library)),
    );
    const definition = createModelDefinition(spec("rnnoise"), {
      assetUrl: url,
      loadRuntime,
    });
    expect(loadRuntime).not.toHaveBeenCalled();

    await definition.create(fakeContext().context);

    expect(loadRuntime).toHaveBeenCalledTimes(1);
  });
});
