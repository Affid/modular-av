import type { Previews } from "@modular-av/api";
import { describe, expect, it } from "vitest";
import { lazyPreviews } from "../src/media/lazy-previews.ts";

const element = {} as HTMLVideoElement;
const options = { device: "default", effect: null } as const;

describe("previews loaded on first use", () => {
  it("load once, and try again after a failed load", async () => {
    // Arrange
    let loads = 0;
    const loaded: Previews = {
      camera: () => Promise.resolve({ stop: () => undefined }),
      microphone: () => Promise.resolve({ stop: () => undefined }),
    };
    const previews = lazyPreviews(() => {
      loads += 1;
      return loads === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(loaded);
    });

    // Act and assert
    await expect(previews.camera(element, options)).rejects.toThrow("offline");
    await previews.camera(element, options);
    await previews.camera(element, options);
    expect(loads).toBe(2);
  });
});
