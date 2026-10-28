// @vitest-environment happy-dom
import type { EffectDefinition, VideoEffectDefinition } from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeVideoEffect,
  createFakeVideoElement,
} from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviews } from "../src/media/preview.ts";
import { createRegistry } from "../src/registry.ts";
import { createTable } from "./table.ts";

afterEach(() => {
  vi.useRealTimers();
});

function setup(...effects: EffectDefinition[]) {
  const env = createFakeMediaEnv();
  const registry = createRegistry<EffectDefinition>("effect");
  registry.open();
  for (const effect of effects) registry.api.register(effect);
  return { env, previews: createPreviews({ env, effects: registry.api }) };
}

describe("a camera preview", () => {
  it("shows the chosen camera, through the chosen effect, and lets it go", async () => {
    // Arrange
    const blur = createFakeVideoEffect("background-blur");
    const { env, previews } = setup(blur.definition);
    const element = createFakeVideoElement();

    // Act
    const preview = await previews.camera(element, {
      device: "hd",
      effect: "background-blur",
    });

    // Assert: the effect runs on the camera, its output shows.
    const instance = blur.instances[0];
    expect(env.captures).toEqual(["video:hd"]);
    expect(instance?.inputs[0]?.kind).toBe("video");
    expect(env.shownOn(element)).toEqual([instance?.output]);
    preview.stop();
    expect(instance?.disposed).toBe(true);
    expect(instance?.inputs[0]?.readyState).toBe("ended");
    expect(env.shownOn(element)).toEqual([]);
  });

  it("shows the camera as it is without an effect, and stops when its element goes", async () => {
    const { env, previews } = setup();
    const element = createFakeVideoElement();

    await previews.camera(element, { device: "default", effect: null });
    const [raw] = env.shownOn(element);
    env.removeElement(element);

    expect(raw?.kind).toBe("video");
    expect(raw?.readyState).toBe("ended");
  });

  it("goes blank, and says so, when its effect fails later", async () => {
    const blur = createFakeVideoEffect("background-blur");
    const { env, previews } = setup(blur.definition);
    const element = createFakeVideoElement();
    const failures: unknown[] = [];

    await previews.camera(element, {
      device: "default",
      effect: "background-blur",
      onFailed: (error) => failures.push(error),
    });
    blur.contexts[0]?.fail(new Error("worker crashed"));

    expect(env.shownOn(element)).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(blur.instances[0]?.disposed).toBe(true);
  });

  it("refuses an effect it doesn't know or that can't run here, releasing the camera", async () => {
    const unsupported = createFakeVideoEffect("background-replace", {
      supported: false,
    });
    const { env, previews } = setup(unsupported.definition);
    const element = createFakeVideoElement();

    await expect(
      previews.camera(element, { device: "default", effect: "nope" }),
    ).rejects.toMatchObject({ code: "unknown-effect" });
    await expect(
      previews.camera(element, {
        device: "default",
        effect: "background-replace",
      }),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(env.captures).toEqual([]);
  });

  it("lets the camera go when its element leaves while it is still opening", async () => {
    const { env } = setup();
    const opened: MediaStreamTrack[] = [];
    const watched = createPreviews({
      env: {
        ...env,
        captureVideo: (id) =>
          env.captureVideo(id).then((track) => {
            opened.push(track);
            return track;
          }),
      },
      effects: { get: () => undefined },
    });
    const element = createFakeVideoElement();

    const pending = watched.camera(element, {
      device: "default",
      effect: null,
    });
    env.removeElement(element);
    await pending;

    expect(opened[0]?.readyState).toBe("ended");
    expect(env.shownOn(element)).toEqual([]);
  });

  it("lets its effect go, and shows nothing, when the effect fails while starting", async () => {
    const effect = { disposed: false };
    const failing: VideoEffectDefinition = {
      id: "background-blur",
      kind: "video",
      label: "Blur",
      cost: "heavy",
      isSupported: () => true,
      create: (context) =>
        Promise.resolve({
          start(input) {
            context.fail(new Error("worker crashed"));
            return Promise.resolve(input);
          },
          replaceInput: () => Promise.resolve(),
          dispose() {
            effect.disposed = true;
          },
        }),
    };
    const { env, previews } = setup(failing);
    const element = createFakeVideoElement();
    const failures: unknown[] = [];

    await previews.camera(element, {
      device: "default",
      effect: "background-blur",
      onFailed: (error) => failures.push(error),
    });

    expect(failures).toHaveLength(1);
    expect(effect.disposed).toBe(true);
    expect(env.shownOn(element)).toEqual([]);
  });

  it("rejects as the browser does when the camera is refused", async () => {
    const { env, previews } = setup();
    env.setDenied("video", "NotAllowedError");

    await expect(
      previews.camera(createFakeVideoElement(), {
        device: "default",
        effect: null,
      }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
  });
});

describe("a microphone preview", () => {
  it("reports the chosen microphone's level until stopped", async () => {
    vi.useFakeTimers();
    const { env, previews } = setup();
    const levels: number[] = [];
    const element = document.createElement("div");

    const preview = await previews.microphone(element, {
      device: "usb",
      listener: (db) => levels.push(db),
    });
    const meter = env.levelMeters[0];
    env.setLevel(meter?.track ?? null, -30);
    vi.advanceTimersByTime(100);
    preview.stop();
    vi.advanceTimersByTime(100);

    expect(env.captures).toEqual(["audio:usb"]);
    expect(levels).toEqual([-30, -30]);
    expect(meter?.disposed).toBe(true);
    expect(meter?.track.readyState).toBe("ended");
  });
});

describe("a microphone preview's options", () => {
  it("are refused before the microphone opens when the listener isn't a function", async () => {
    const { env, previews } = setup();

    await expect(
      previews.microphone(document.createElement("div"), {
        device: "default",
        listener: "nope" as unknown as (db: number) => void,
      }),
    ).rejects.toThrow(TypeError);
    expect(env.captures).toEqual([]);
  });

  it("stop the preview when the listener throws", async () => {
    vi.useFakeTimers();
    const { env, previews } = setup();

    await previews.microphone(document.createElement("div"), {
      device: "default",
      listener: () => {
        throw new Error("broken listener");
      },
    });
    vi.advanceTimersByTime(100);

    expect(env.levelMeters[0]?.disposed).toBe(true);
  });
});

describe("previews through the core's API", () => {
  it("load on first use and preview a camera outside any call", async () => {
    vi.useFakeTimers();
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();
    const element = createFakeVideoElement();

    const preview = await p1.api.preview.camera(element, {
      device: "default",
      effect: null,
    });

    expect(p1.api.state.get().session.status).not.toBe("connected");
    expect(p1.env.shownOn(element)).toHaveLength(1);
    preview.stop();
    expect(p1.env.shownOn(element)).toEqual([]);
  });
});
