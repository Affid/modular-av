import { describe, expect, it } from "vitest";
import {
  type DevicePreviews,
  lazyPreviews,
} from "../src/media/lazy-previews.ts";

const element = {} as HTMLVideoElement;
const options = { device: "default", effect: null } as const;

describe("previews loaded on first use", () => {
  it("load once, and try again after a failed load", async () => {
    // Arrange
    let loads = 0;
    const loaded: DevicePreviews = {
      camera: () => Promise.resolve({ stop: () => undefined }),
      microphone: () => Promise.resolve({ stop: () => undefined }),
    };
    const previews = lazyPreviews(
      () => {
        loads += 1;
        return loads === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(loaded);
      },
      () => null,
    );

    // Act and assert
    await expect(previews.camera(element, options)).rejects.toThrow("offline");
    await previews.camera(element, options);
    await previews.camera(element, options);
    expect(loads).toBe(2);
  });

  it("need no load for the voice, which is the call's own audio", () => {
    // Arrange
    let loads = 0;
    const stream = {} as MediaStream;
    const previews = lazyPreviews(
      () => {
        loads += 1;
        return Promise.reject(new Error("offline"));
      },
      () => stream,
    );

    // Act and assert
    expect(previews.voice()).toBe(stream);
    expect(loads).toBe(0);
  });
});
