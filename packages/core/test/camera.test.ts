import type {
  EffectContext,
  VideoEffect,
  VideoEffectDefinition,
} from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  type FakeMediaEnv,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Camera, createCamera, STALL_MS } from "../src/media/camera.ts";

interface FakeVideoEffect extends VideoEffect {
  readonly output: MediaStreamTrack;
  readonly inputs: MediaStreamTrack[];
  disposed: boolean;
}

interface Control {
  readonly definition: VideoEffectDefinition;
  readonly instances: FakeVideoEffect[];
  readonly contexts: EffectContext[];
  /** Resolves the oldest pending start. */
  started(): Promise<void>;
  failStart(error: Error): Promise<void>;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function videoEffect(id: string, supported = true): Control {
  const instances: FakeVideoEffect[] = [];
  const contexts: EffectContext[] = [];
  const starts: { resolve(): void; reject(e: Error): void }[] = [];
  const definition: VideoEffectDefinition = {
    id,
    kind: "video",
    label: id,
    cost: "heavy",
    isSupported: () => supported,
    create(context) {
      contexts.push(context);
      const output = createFakeTrack("video", `${id} output`);
      const effect: FakeVideoEffect = {
        output,
        inputs: [],
        disposed: false,
        start(input) {
          effect.inputs.push(input);
          return new Promise((resolve, reject) => {
            starts.push({
              resolve: () => {
                resolve(output);
              },
              reject,
            });
          });
        },
        replaceInput(input) {
          effect.inputs.push(input);
          return Promise.resolve();
        },
        dispose() {
          effect.disposed = true;
        },
      };
      instances.push(effect);
      return Promise.resolve(effect);
    },
  };
  const take = () => {
    const next = starts.shift();
    if (!next) throw new Error(`${id} is not starting`);
    return next;
  };
  return {
    definition,
    instances,
    contexts,
    async started() {
      await flush();
      take().resolve();
      await flush();
    },
    async failStart(error) {
      await flush();
      take().reject(error);
      await flush();
    },
  };
}

interface Setup {
  readonly env: FakeMediaEnv;
  readonly camera: Camera;
  readonly changes: ReturnType<typeof vi.fn>;
}

function setup(env = createFakeMediaEnv()): Setup {
  const changes = vi.fn();
  const camera = createCamera({
    env,
    onChange: changes,
    onReplaced: vi.fn(),
    onError: vi.fn(),
  });
  return { env, camera, changes };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("camera without effects", () => {
  it("sends the raw camera", async () => {
    const { camera } = setup();
    const raw = createFakeTrack("video", "cam");

    await camera.setInput(raw);

    expect(camera.output).toBe(raw);
    expect(camera.hold).toBeNull();
  });

  it("sends nothing without a camera", async () => {
    const { camera } = setup();

    await camera.setInput(null);

    expect(camera.output).toBeNull();
    expect(camera.hold).toBeNull();
  });
});

describe("camera with an effect: fail closed", () => {
  it("holds the camera from the moment an effect is wanted until its first frame", async () => {
    // Arrange
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    const raw = createFakeTrack("video", "cam");
    await camera.setInput(raw);

    // Act
    camera.setEffects([blur.definition], new Set(["blur"]));
    const whileStarting = { output: camera.output, hold: camera.hold };
    await blur.started();
    const beforeFrame = { output: camera.output, hold: camera.hold };
    env.frame(blur.instances[0]?.output);
    await flush();

    // Assert
    expect(whileStarting).toEqual({ output: null, hold: "effect-starting" });
    expect(beforeFrame).toEqual({ output: null, hold: "effect-starting" });
    expect(blur.instances[0]?.inputs).toEqual([raw]);
    expect(camera.output).toBe(blur.instances[0]?.output);
    expect(camera.hold).toBeNull();
    expect(camera.effectStatus("blur").status).toBe("running");
  });

  it("holds the camera while the effect sends no frames, and sends again once it does", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    const output = blur.instances[0]?.output;
    env.frame(output);
    await flush();

    await vi.advanceTimersByTimeAsync(STALL_MS + 10);
    const stalled = { output: camera.output, hold: camera.hold };
    env.frame(output);
    await flush();

    expect(stalled).toEqual({ output: null, hold: "effect-stalled" });
    expect(camera.output).toBe(output);
    expect(camera.hold).toBeNull();
  });

  it("keeps a stalled effect's camera held while no frame comes", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    env.frame(blur.instances[0]?.output);
    await flush();

    await vi.advanceTimersByTimeAsync(STALL_MS * 5);

    expect(camera.hold).toBe("effect-stalled");
  });

  it("keeps the camera off, never raw, when the effect fails to start", async () => {
    const { camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));

    await blur.failStart(new DOMException("no WebGL", "NotSupportedError"));

    expect(camera.output).toBeNull();
    expect(camera.hold).toBe("effect-failed");
    expect(camera.effectStatus("blur")).toEqual({
      status: "failed",
      error: "NotSupportedError",
    });
  });

  it("keeps the camera off when a running effect fails", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    env.frame(blur.instances[0]?.output);
    await flush();

    blur.contexts[0]?.fail(new Error("mask crashed"));
    await flush();

    expect(camera.output).toBeNull();
    expect(camera.hold).toBe("effect-failed");
    expect(blur.instances[0]?.disposed).toBe(true);
  });

  it("keeps the camera off for an effect this browser can't run", async () => {
    const { camera } = setup();
    const blur = videoEffect("blur", false);
    await camera.setInput(createFakeTrack("video", "cam"));

    camera.setEffects([blur.definition], new Set(["blur"]));

    expect(camera.output).toBeNull();
    expect(camera.hold).toBe("effect-failed");
    expect(camera.effectStatus("blur").status).toBe("unsupported");
  });

  it("treats every video effect as unsupported where frames can't be watched", async () => {
    const { camera } = setup(createFakeMediaEnv({ watchFrames: false }));
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));

    camera.setEffects([blur.definition], new Set(["blur"]));

    expect(camera.effectStatus("blur").status).toBe("unsupported");
    expect(camera.output).toBeNull();
  });

  it("sends raw again once the player turns the effect off", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    const raw = createFakeTrack("video", "cam");
    await camera.setInput(raw);
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    env.frame(blur.instances[0]?.output);
    await flush();

    camera.setEffects([blur.definition], new Set());
    await flush();

    expect(camera.output).toBe(raw);
    expect(blur.instances[0]?.disposed).toBe(true);
    expect(env.watching(blur.instances[0]?.output)).toBe(false);
  });
});

describe("camera effect swaps and restarts", () => {
  it("keeps the old effect's video until the new one sends its first frame", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    const replace = videoEffect("replace");
    const defs = [blur.definition, replace.definition];
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects(defs, new Set(["blur"]));
    await blur.started();
    const blurred = blur.instances[0]?.output;
    env.frame(blurred);
    await flush();

    camera.setEffects(defs, new Set(["blur", "replace"]));
    const whileStarting = camera.output;
    await replace.started();
    env.frame(replace.instances[0]?.output);
    await flush();

    expect(whileStarting).toBe(blurred);
    expect(camera.output).toBe(replace.instances[0]?.output);
    expect(blur.instances[0]?.disposed).toBe(true);
  });

  it("keeps the effect across a camera restart, feeding it the new input", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    const output = blur.instances[0]?.output;
    env.frame(output);
    await flush();

    await camera.setInput(null);
    const off = { output: camera.output, hold: camera.hold };
    const again = createFakeTrack("video", "cam again");
    await camera.setInput(again);
    const beforeFrame = camera.output;
    env.frame(output);
    await flush();

    expect(off).toEqual({ output: null, hold: null });
    expect(blur.instances).toHaveLength(1);
    expect(blur.instances[0]?.inputs.at(-1)).toBe(again);
    expect(beforeFrame).toBeNull();
    expect(camera.output).toBe(output);
  });

  it("starts an effect wanted while the camera was off once it comes on", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");

    camera.setEffects([blur.definition], new Set(["blur"]));
    const raw = createFakeTrack("video", "cam");
    await camera.setInput(raw);
    await blur.started();
    env.frame(blur.instances[0]?.output);
    await flush();

    expect(blur.instances[0]?.inputs).toEqual([raw]);
    expect(camera.output).toBe(blur.instances[0]?.output);
  });

  it("feeds a device chosen while the effect started to it afterwards", async () => {
    const { camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "usb"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await flush();

    const headset = createFakeTrack("video", "headset");
    const switching = camera.setInput(headset);
    await blur.started();
    await switching;

    expect(blur.instances[0]?.inputs.at(-1)).toBe(headset);
  });

  it("starts an effect again when the camera went off while it was starting", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await flush();

    await camera.setInput(null);
    const aborted = blur.contexts[0]?.signal.aborted;
    await camera.setInput(createFakeTrack("video", "cam again"));
    await blur.started();
    await blur.started();
    env.frame(blur.instances[1]?.output);
    await flush();

    expect(aborted).toBe(true);
    expect(blur.instances[0]?.disposed).toBe(true);
    expect(camera.effectStatus("blur").status).toBe("running");
    expect(camera.output).toBe(blur.instances[1]?.output);
  });

  it("fails the effect closed when it can't take the new input", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    const effect = blur.instances[0];
    env.frame(effect?.output);
    await flush();
    if (effect)
      effect.replaceInput = () => Promise.reject(new Error("lost context"));

    await camera.setInput(createFakeTrack("video", "headset"));

    expect(camera.output).toBeNull();
    expect(camera.hold).toBe("effect-failed");
  });

  it("disposes the effect and stops watching once disposed", async () => {
    const { env, camera } = setup();
    const blur = videoEffect("blur");
    await camera.setInput(createFakeTrack("video", "cam"));
    camera.setEffects([blur.definition], new Set(["blur"]));
    await blur.started();
    env.frame(blur.instances[0]?.output);
    await flush();

    camera.dispose();

    expect(blur.instances[0]?.disposed).toBe(true);
    expect(env.watching(blur.instances[0]?.output)).toBe(false);
    expect(camera.output).toBeNull();
  });
});
