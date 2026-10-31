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
  defaultPlace: AudioEffectDefinition["defaultPlace"],
  made: (AudioEffect & { disposed: boolean })[],
  extra: Partial<AudioEffectDefinition> = {},
): AudioEffectDefinition {
  return {
    ...extra,
    id,
    kind: "audio",
    label: id,
    defaultPlace,
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
  place: AudioEffectDefinition["defaultPlace"] = "pre-gate",
  extra: Partial<AudioEffectDefinition> = {},
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
  mic.setEffects(
    [definition("rnnoise", place, made, extra)],
    new Set(["rnnoise"]),
  );
  await flush();
  const capture = env.captureContexts[0];
  const effect = made[0];
  const sources = {
    "pre-gate": capture?.sources[0]?.node,
    "post-gate": capture?.level("post feed")?.node,
    send: capture?.level("send")?.node,
  };
  const source = sources[place];
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

/** Two pre-gate effects in a row, in that order. */
async function inSeries(
  firstExtra: Partial<AudioEffectDefinition> = {},
): Promise<{
  readonly mic: Microphone;
  readonly input: FakeSignalProbe;
  readonly first: FakeSignalProbe | undefined;
  readonly second: FakeSignalProbe | undefined;
}> {
  const env = createFakeMediaEnv();
  const mic = createMicrophone({
    env,
    gate: GATE,
    onChange: vi.fn(),
    onReplaced: vi.fn(),
    onError: vi.fn(),
  });
  const made: (AudioEffect & { disposed: boolean })[] = [];
  await mic.setInput(createFakeTrack("audio", "mic"));
  mic.setEffects(
    [
      definition("model", "pre-gate", made, {
        ...firstExtra,
        exclusiveGroup: "noise-suppression",
      }),
      definition("pitch", "pre-gate", made),
    ],
    new Set(["model", "pitch"]),
  );
  await flush();
  const capture = env.captureContexts[0];
  const source = capture?.sources[0]?.node;
  const [model, pitch] = made;
  if (!capture || !source || !model || !pitch) throw new Error("not running");
  await capture.resume();
  return {
    mic,
    // Without a watched effect there is no tap: a stand-in keeps this uniform.
    input: capture.probeFedBy(source) ?? capture.createProbe(),
    first: capture.probeFedBy(model.output),
    second: capture.probeFedBy(pitch.output),
  };
}

describe("the stall watchdog", () => {
  it("takes out a pre-gate effect that sends digital silence while the microphone hears sound", async () => {
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

  it.each(["post-gate", "send"] as const)(
    "takes out a %s effect that goes silent while sound goes in",
    async (place) => {
      // Arrange
      const r = await running(place);
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
      expect(r.capture.level("channel")?.level).toBe(1);
    },
  );

  it.each(["post-gate", "send"] as const)(
    "leaves a %s effect alone while nothing goes in",
    async (place) => {
      const r = await running(place);
      r.input.setPeak(0);
      r.output.setPeak(0);

      await vi.advanceTimersByTimeAsync(STALL_MS * 3);
      await flush();

      expect(r.mic.effectStatus("rnnoise").status).toBe("running");
    },
  );

  it("waits out a declared tail: a long delay is silent before its first echo", async () => {
    // Arrange
    const r = await running("send", { tail: 2 });
    r.input.setPeak(SPEECH);
    r.output.setPeak(0);

    // Act
    await vi.advanceTimersByTimeAsync(STALL_MS + 300);
    await flush();
    const during = r.mic.effectStatus("rnnoise").status;
    await vi.advanceTimersByTimeAsync(2000);
    await flush();

    // Assert
    expect(during).toBe("running");
    expect(r.mic.effectStatus("rnnoise").status).toBe("failed");
  });

  it.each([
    ["a non-number", Number.NaN],
    ["an infinite level", Infinity],
    ["a level far above full scale", 20],
  ])("takes out an effect sending %s at once", async (_name, peak) => {
    // Arrange
    const r = await running("send");
    r.input.setPeak(0);
    r.output.setPeak(peak);

    // Act
    await vi.advanceTimersByTimeAsync(300);
    await flush();

    // Assert
    expect(r.mic.effectStatus("rnnoise")).toEqual({
      status: "failed",
      error: "RunawayError",
    });
  });

  it("leaves a loud but normal effect alone", async () => {
    const r = await running("post-gate");
    r.input.setPeak(SPEECH);
    r.output.setPeak(2);

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("leaves alone an effect that says it silences noise", async () => {
    const r = await running("pre-gate", { silencesNoise: true });
    r.input.setPeak(SPEECH);

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(r.mic.effectStatus("rnnoise").status).toBe("running");
    expect(r.capture.probeFedBy(r.effect.output)).toBeUndefined();
  });

  it("watches every effect ahead of the gate", async () => {
    const r = await inSeries();
    r.input.setPeak(SPEECH);
    r.first?.setPeak(SPEECH);
    r.second?.setPeak(0);

    await vi.advanceTimersByTimeAsync(STALL_MS + 300);
    await flush();

    expect(r.mic.effectStatus("model").status).toBe("running");
    expect(r.mic.effectStatus("pitch")).toEqual({
      status: "failed",
      error: "StalledError",
    });
  });

  it("blames a stall on the first silent effect, not on those behind it", async () => {
    const r = await inSeries();
    r.input.setPeak(SPEECH);
    r.first?.setPeak(0);
    r.second?.setPeak(0);

    await vi.advanceTimersByTimeAsync(STALL_MS + 100);
    await flush();

    expect(r.mic.effectStatus("model").status).toBe("failed");
    expect(r.mic.effectStatus("pitch").status).toBe("running");
  });

  it("gives what was behind a stall its full time again", async () => {
    // Arrange: it still hears nothing as the blamed effect leaves.
    const r = await inSeries();
    r.input.setPeak(SPEECH);
    r.first?.setPeak(0);
    r.second?.setPeak(0);

    // Act
    await vi.advanceTimersByTimeAsync(STALL_MS + 300);
    await flush();

    // Assert
    expect(r.mic.effectStatus("model").status).toBe("failed");
    expect(r.mic.effectStatus("pitch").status).toBe("running");
  });

  it("leaves alone an effect behind one that silences noise", async () => {
    const r = await inSeries({ silencesNoise: true });

    expect(r.first).toBeUndefined();
    expect(r.second).toBeUndefined();
  });

  it("reports a tap it can't remove, and goes on", async () => {
    const r = await running();
    const broken = new Error("probe broke");
    r.output.dispose = () => {
      throw broken;
    };

    r.mic.setEffects([], new Set());
    await flush();

    expect(r.errors).toContain(broken);
    expect(r.mic.effectStatus("rnnoise").status).toBe("off");
  });

  it("removes its taps once the effect stops", async () => {
    const r = await running();

    r.mic.setEffects([], new Set());
    await flush();

    expect(r.output.disposed).toBe(true);
    expect(r.capture.graph.feeds(r.effect.output, r.output.node)).toBe(false);
  });
});
