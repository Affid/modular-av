import type { EffectDefinition, ModularAV } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import { registerModels } from "../src/register.ts";
import { createRuntime } from "../src/runtime.ts";
import { fakeContext, fakeLibrary } from "./fakes.ts";

describe("registering the models", () => {
  it("registers RNNoise, Speex and GTCRN, resolving files in this module", async () => {
    // Arrange
    const registered: EffectDefinition[] = [];
    const api = {
      effects: { register: (d: EffectDefinition) => registered.push(d) },
      assetUrl: vi.fn((id: string, path: string) => `/modules/${id}/${path}`),
    } as unknown as Pick<ModularAV, "effects" | "assetUrl">;
    const runtime = createRuntime(fakeLibrary().library);
    const { context, addModule } = fakeContext();

    // Act
    registerModels(api, () => Promise.resolve(runtime));
    const rnnoise = registered[0];
    if (rnnoise?.kind !== "audio") throw new Error("no audio effect");
    await rnnoise.create(context);

    // Assert
    expect(registered.map((d) => d.id)).toEqual(["rnnoise", "speex", "gtcrn"]);
    expect(addModule).toHaveBeenCalledWith(
      "/modules/modular-av-mic-denoise/models/rnnoise-worklet.js",
    );
  });
});
