import type { EffectContext, VideoEffectDefinition } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import {
  canRunBackground,
  createBackgroundDefinitions,
  type DefinitionDeps,
} from "../src/definition.ts";
import type { BackgroundEffect, HostOptions } from "../src/host.ts";
import { MODULE_ID, registerSettings } from "../src/settings.ts";
import { fakeSettings } from "./fakes.ts";

const context = (): EffectContext => ({
  signal: new AbortController().signal,
  fail: vi.fn(),
});

function fakeHost(): BackgroundEffect & {
  readonly calls: string[];
  options?: HostOptions;
} {
  const calls: string[] = [];
  return {
    calls,
    start: vi.fn(() => Promise.resolve({ id: "out" } as MediaStreamTrack)),
    replaceInput: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(() => calls.push("dispose")),
    setStrength: (v) => calls.push(`strength ${String(v)}`),
    setImage: (url) => {
      calls.push(`image ${url}`);
      return url.includes("broken")
        ? Promise.reject(new Error("no image"))
        : Promise.resolve();
    },
    setQuality: (q) => calls.push(`quality ${q}`),
    stats: vi.fn(),
  };
}

function setup(): {
  readonly definitions: readonly VideoEffectDefinition[];
  readonly settings: ReturnType<typeof fakeSettings>;
  readonly host: ReturnType<typeof fakeHost>;
  readonly errors: unknown[];
} {
  const settings = fakeSettings();
  const observed = registerSettings(settings);
  const host = fakeHost();
  const errors: unknown[] = [];
  const deps: DefinitionDeps = {
    assetUrl: (path) => `/modules/${MODULE_ID}/${path}`,
    route: (path) => `/${path}`,
    settings: observed,
    loadHost: () =>
      Promise.resolve({
        createHost: (options: HostOptions) => {
          host.options = options;
          return host;
        },
        workerPort: () => {
          throw new Error("no worker in unit tests");
        },
        decodeImage: () => Promise.reject(new Error("no images here")),
      }),
    loadEffect: () => import("../src/effect.ts"),
    onError: (e) => errors.push(e),
    canRun: () => true,
  };
  return {
    definitions: createBackgroundDefinitions(deps),
    settings,
    host,
    errors,
  };
}

describe("the camera background effects", () => {
  it("are blur and replace, one choice in the camera-background group", () => {
    const { definitions } = setup();

    expect(
      definitions.map((d) => [d.id, d.kind, d.exclusiveGroup, d.cost, d.label]),
    ).toEqual([
      [
        "background-blur",
        "video",
        "camera-background",
        "medium",
        `${MODULE_ID}.effects.blur`,
      ],
      [
        "background-replace",
        "video",
        "camera-background",
        "medium",
        `${MODULE_ID}.effects.replace`,
      ],
    ]);
  });

  it("start the worker with this module's files and the player's settings", async () => {
    const { definitions, settings, host } = setup();
    settings.store("blurStrength", 0.8);
    settings.store("quality", "high");

    const effect = await definitions[0]?.create(context());
    await effect?.start({} as MediaStreamTrack);

    expect(host.options).toMatchObject({
      mode: "blur",
      strength: 0.8,
      quality: "high",
      image: null,
      files: {
        loader: `/modules/${MODULE_ID}/mediapipe/vision_wasm_module_internal.js`,
        wasm: `/modules/${MODULE_ID}/mediapipe/vision_wasm_module_internal.wasm`,
      },
      models: {
        standard: `/modules/${MODULE_ID}/models/selfie_segmenter.tflite`,
        high: `/modules/${MODULE_ID}/models/selfie_multiclass_256x256.tflite`,
      },
    });
  });

  it("replace with the chosen image, through Foundry's route", async () => {
    const { definitions, settings, host } = setup();
    settings.store("image", "ui/backgrounds/setup.webp");

    const effect = await definitions[1]?.create(context());
    await effect?.start({} as MediaStreamTrack);

    expect(host.options).toMatchObject({
      mode: "replace",
      image: "/ui/backgrounds/setup.webp",
    });
  });

  it("follow setting changes while they run, until disposed", async () => {
    // Arrange
    const { definitions, settings, host } = setup();
    const effect = await definitions[1]?.create(context());
    await effect?.start({} as MediaStreamTrack);

    // Act
    await settings.set(MODULE_ID, "blurStrength", 0.3);
    await settings.set(MODULE_ID, "quality", "high");
    await settings.set(MODULE_ID, "image", "worlds/w/tavern.png");
    effect?.dispose();
    await settings.set(MODULE_ID, "blurStrength", 0.9);

    // Assert
    expect(host.calls).toEqual([
      "strength 0.3",
      "quality high",
      "image /worlds/w/tavern.png",
      "dispose",
    ]);
  });

  it("keep the old image and report it when a new one can't load", async () => {
    const { definitions, settings, errors } = setup();
    const effect = await definitions[1]?.create(context());
    await effect?.start({} as MediaStreamTrack);

    await settings.set(MODULE_ID, "image", "worlds/w/broken.png");
    await Promise.resolve();

    expect(errors).toHaveLength(1);
  });

  it("refuse to start replacing with an address that isn't an image's", async () => {
    const { definitions, settings } = setup();
    settings.store("image", "javascript:alert(1)");

    await expect(definitions[1]?.create(context())).rejects.toMatchObject({
      name: "ImageLoadError",
    });
  });

  it("stop before loading anything when turned off while created", async () => {
    const { definitions } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(
      definitions[0]?.create({ signal: controller.signal, fail: vi.fn() }),
    ).rejects.toThrow();
  });
});

describe("what a browser needs for the camera background", () => {
  const full = {
    Worker: vi.fn(),
    OffscreenCanvas: vi.fn(),
    VideoFrame: vi.fn(),
    MediaStreamTrackProcessor: vi.fn(),
    MediaStreamTrackGenerator: vi.fn(),
    createImageBitmap: vi.fn(),
  };

  it("is a worker, OffscreenCanvas with WebGL2, and insertable streams", () => {
    expect(canRunBackground(full, () => true)).toBe(true);
    expect(canRunBackground(full, () => false)).toBe(false);
  });

  it.each(Object.keys(full))("is missing without %s", (missing) => {
    expect(
      canRunBackground({ ...full, [missing]: undefined }, () => true),
    ).toBe(false);
  });
});
