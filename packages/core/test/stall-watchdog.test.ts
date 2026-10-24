import type { AudioEffect, AudioEffectDefinition } from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  type FakeCaptureContext,
  type FakeSignalProbe,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GateConfig } from "../src/media/env.ts";
import { createMicrophone, type Microphone } from "../src/media/microphone.ts";
import { STALL_MS } from "../src/media/stall-watchdog.ts";

const GATE: GateConfig = { mode: "gate", auto: true, threshold: -50 };
const SPEECH = 0.1;

interface Running {
  readonly mic: Microphone;
  readonly capture: FakeCaptureContext;
  readonly effect: AudioEffect & { disposed: boolean };
  readonly errors: unknown[];
  /** The tap on the raw microphone and the one on the effect's output. */
  readonly input: FakeSignalProbe;
  readonly output: FakeSignalProbe;
}

function definition(
  id: string,
  stage: AudioEffectDefinition["stage"],
  made: (AudioEffect & { disposed: boolean })[],
): AudioEffectDefinition {
  return {
    id,
    kind: "audio",
    label: id,
    stage,
    cost: "light",
    isSupported: () => true,
    create({ audioContext }) {
      const node = audioContext.createGain();
      const instance = {
        input: node,
        output: node,
        disposed: false,
        dispose() {
          this.disposed = true;
        },
      };
      made.push(instance);
      return Promise.resolve(instance);
    },
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

async function running(
  stage: AudioEffectDefinition["stage"] = "denoise",
): Promise<Running> {
  const env = createFakeMediaEnv();
  const errors: unknown[] = [];
  const mic = createMicrophone({
    env,
    gate: GATE,
    onChange: vi.fn(),
    onReplaced: vi.fn(),
    onError: (error) => errors.push(error),
  });
  const made: (AudioEffect & { disposed: boolean })[] = [];
  await mic.setInput(createFakeTrack("audio", "mic"));
  mic.setEffects([definition("rnnoise", stage, made)], new Set(["rnnoise"]));
  await flush();
  const capture = env.captureContexts[0];
  const effect = made[0];
  const source = capture?.sources[0]?.node;
  if (!capture || !effect || !source) throw new Error("not running");
  await capture.resume();
  // An effect that isn't watched has no tap: stand-ins keep tests uniform.
  const input = capture.probeFedBy(source) ?? capture.createProbe();
  const output = capture.probeFedBy(effect.output) ?? capture.createProbe();
  return { mic, capture, effect, errors, input, output };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the stall watchdog", () => {
  it("takes out a denoise effect that sends digital silence while the microphone hears sound", async () => {
    // Arrange
    const r = await running();
    r.input.setPeak(SPEECH);
    r.output.setPeak(0);

    // Act
    await vi.advanceTimersByTimeAsync(STALL_MS + 300);
    await flush();

    // Assert
    expect(r.mic.effectStatus("rnnoise")).toEqual({
      status: "failed",
      error: "StalledError",
    });
    expect(r.effect.disposed).toBe(true);
    const source = r.capture.sources[0]?.node;
    const gate = r.capture.gates[0]?.node;
    expect(source && gate && r.capture.graph.feeds(source, gate)).toBe(true);
  });

  it("waits the full time before it does", async () => {
    const r = await running();
    r.input.setPeak(SPEECH);

    await vi.advanceTimersByTimeAsync(STALL_MS - 300);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("starts over once the effect sends sound again", async () => {
    const r = await running();
    r.input.setPeak(SPEECH);
    await vi.advanceTimersByTimeAsync(STALL_MS - 300);
    r.output.setPeak(0.001);
    await vi.advanceTimersByTimeAsync(300);
    r.output.setPeak(0);

    await vi.advanceTimersByTimeAsync(STALL_MS - 300);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("keeps counting through pauses in the speech", async () => {
    const r = await running();
    for (let i = 0; i < 4; i += 1) {
      r.input.setPeak(SPEECH);
      await vi.advanceTimersByTimeAsync(STALL_MS / 3);
      r.input.setPeak(0);
      await vi.advanceTimersByTimeAsync(1000);
    }
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("failed");
  });

  it("leaves a quiet effect alone: removing noise isn't silence", async () => {
    const r = await running();
    r.input.setPeak(SPEECH);
    r.output.setPeak(1e-6);

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("leaves it alone while the microphone is silent too", async () => {
    const r = await running();
    r.input.setPeak(0);

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("doesn't count while the capture context is suspended", async () => {
    const r = await running();
    r.input.setPeak(SPEECH);
    await r.capture.suspend();

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("watches only the denoise stage", async () => {
    const r = await running("post");
    r.input.setPeak(SPEECH);

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("removes its taps once the effect stops", async () => {
    const r = await running();

    r.mic.setEffects([], new Set());
    await flush();

    expect(r.output.disposed).toBe(true);
    expect(r.capture.graph.feeds(r.effect.output, r.output.node)).toBe(false);
  });
});
