import type {
  AudioEffect,
  AudioEffectContext,
  AudioEffectDefinition,
  AudioPlace,
} from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  type FakeCaptureContext,
  type FakeMediaEnv,
  type FakeMediaEnvOptions,
} from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import type { GateConfig } from "../src/media/env.ts";
import { createMicrophone, type Microphone } from "../src/media/microphone.ts";

const GATE: GateConfig = { mode: "gate", auto: true, threshold: -50 };

interface FakeEffect {
  readonly definition: AudioEffectDefinition;
  readonly contexts: AudioEffectContext[];
  readonly instances: (AudioEffect & { disposed: boolean })[];
}

function fakeEffect(
  id: string,
  options: {
    defaultPlace?: AudioPlace;
    group?: string;
    fail?: Error;
  } = {},
): FakeEffect {
  const contexts: AudioEffectContext[] = [];
  const instances: FakeEffect["instances"] = [];
  const definition: AudioEffectDefinition = {
    id,
    kind: "audio",
    label: id,
    defaultPlace: options.defaultPlace ?? "pre-gate",
    ...(options.group ? { exclusiveGroup: options.group } : {}),
    cost: "light",
    isSupported: () => true,
    create(context) {
      contexts.push(context);
      if (options.fail) return Promise.reject(options.fail);
      const node = context.audioContext.createGain();
      const instance = {
        input: node,
        output: node,
        disposed: false,
        dispose() {
          this.disposed = true;
        },
      };
      instances.push(instance);
      return Promise.resolve(instance);
    },
  };
  return { definition, contexts, instances };
}

interface Setup {
  readonly env: FakeMediaEnv;
  readonly mic: Microphone;
  readonly changes: ReturnType<typeof vi.fn>;
  readonly errors: unknown[];
  capture(): FakeCaptureContext;
}

function setup(options: FakeMediaEnvOptions = {}): Setup {
  const env = createFakeMediaEnv(options);
  const changes = vi.fn();
  const errors: unknown[] = [];
  const mic = createMicrophone({
    env,
    gate: GATE,
    onChange: changes,
    onReplaced: vi.fn(),
    onError: (error) => errors.push(error),
  });
  return {
    env,
    mic,
    changes,
    errors,
    capture() {
      const capture = env.captureContexts[0];
      if (!capture) throw new Error("no capture context yet");
      return capture;
    },
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("microphone pipeline", () => {
  it("sends the capture context's output, gated, once a device is in", async () => {
    // Arrange
    const s = setup();

    // Act
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    // Assert
    const capture = s.capture();
    expect(s.mic.output).toBe(capture.output);
    expect(capture.running).toBe(true);
    expect(s.mic.gateRunning).toBe(true);
    expect(capture.graph.edges()).toEqual([
      "source:mic->gate",
      "gate->mute",
      "mute->post feed",
      "post feed->channel",
      "channel->destination",
    ]);
    expect(capture.gates[0]?.configs).toEqual([GATE]);
    expect(s.changes).toHaveBeenCalled();
  });

  it("keeps the same output track when the device changes", async () => {
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "usb"));
    const output = s.mic.output;

    await s.mic.setInput(createFakeTrack("audio", "headset"));

    expect(s.mic.output).toBe(output);
    expect(s.env.captureContexts).toHaveLength(1);
    expect(new Set(s.capture().graph.edges())).toEqual(
      new Set([
        "gate->mute",
        "mute->post feed",
        "post feed->channel",
        "channel->destination",
        "source:headset->gate",
      ]),
    );
  });

  it("sends nothing and suspends the context without a device", async () => {
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    await s.mic.setInput(null);

    expect(s.mic.output).toBeNull();
    expect(s.capture().running).toBe(false);
    expect(s.capture().graph.edges()).toEqual([]);
  });

  it("creates nothing until a device is in", async () => {
    const s = setup();

    await s.mic.setInput(null);

    expect(s.env.captureContexts).toEqual([]);
    expect(s.mic.output).toBeNull();
  });

  it("is an open mic when the gate can't load, and tries again with the next device", async () => {
    const s = setup();
    const capture = await s.env.createCaptureContext();
    capture.failGates(new Error("worklet 404"));
    const mic = createMicrophone({
      env: { ...s.env, createCaptureContext: () => Promise.resolve(capture) },
      gate: GATE,
      onChange: vi.fn(),
      onReplaced: vi.fn(),
      onError: (error) => s.errors.push(error),
    });

    await mic.setInput(createFakeTrack("audio", "mic"));
    const open = mic.gateRunning;
    const edges = capture.graph.edges();
    capture.failGates(null);
    await mic.setInput(null);
    await mic.setInput(createFakeTrack("audio", "mic2"));

    expect(open).toBe(false);
    expect(edges).toEqual([
      "source:mic->mute",
      "mute->post feed",
      "post feed->channel",
      "channel->destination",
    ]);
    expect(s.errors).toHaveLength(1);
    expect(mic.gateRunning).toBe(true);
  });

  it("takes a gate that breaks out of the chain and says so", async () => {
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    s.changes.mockClear();

    s.capture().gates[0]?.fail(new Error("processorerror"));

    expect(s.mic.gateRunning).toBe(false);
    expect(s.capture().gates[0]?.disposed).toBe(true);
    expect(new Set(s.capture().graph.edges())).toEqual(
      new Set([
        "source:mic->mute",
        "mute->post feed",
        "post feed->channel",
        "channel->destination",
      ]),
    );
    expect(s.changes).toHaveBeenCalled();
  });

  it("reconfigures the running gate, and creates later ones configured", async () => {
    const s = setup();
    const detect: GateConfig = { mode: "detect", auto: false, threshold: -40 };

    s.mic.setGate(detect);
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    const configured = s.capture().gates[0]?.configs;
    s.mic.setGate(GATE);

    expect(configured).toEqual([detect]);
    expect(s.capture().gates[0]?.configs).toEqual([detect, GATE]);
  });

  it("configures a gate whose settings changed while it loaded", async () => {
    const s = setup();
    const capture = await s.env.createCaptureContext();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mic = createMicrophone({
      env: {
        createAudioEffectHost: () => () => Promise.reject(new Error("unused")),
        createCaptureContext: () =>
          Promise.resolve({
            ...capture,
            createGate: async (config: GateConfig) => {
              await held;
              return capture.createGate(config);
            },
          }),
      },
      gate: GATE,
      onChange: vi.fn(),
      onReplaced: vi.fn(),
      onError: vi.fn(),
    });
    const detect: GateConfig = { mode: "detect", auto: true, threshold: -50 };

    const loading = mic.setInput(createFakeTrack("audio", "mic"));
    await flush();
    mic.setGate(detect);
    release();
    await loading;

    expect(capture.gates[0]?.configs).toEqual([GATE, detect]);
  });

  it("tells listeners the gate closed when it breaks while open", async () => {
    const s = setup();
    const heard: boolean[] = [];
    s.mic.onGate((open) => heard.push(open));
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    s.capture().gates[0]?.emit(true);

    s.capture().gates[0]?.fail(new Error("processorerror"));

    expect(heard).toEqual([true, false]);
  });

  it("leaves nothing running if disposed while the context loads", async () => {
    // Arrange
    const s = setup();
    const capture = await s.env.createCaptureContext();
    let loaded = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const mic = createMicrophone({
      env: {
        createAudioEffectHost: () => () => Promise.reject(new Error("unused")),
        createCaptureContext: async () => {
          await held;
          return capture;
        },
      },
      gate: GATE,
      onChange: vi.fn(),
      onReplaced: vi.fn(),
      onError: vi.fn(),
    });

    // Act
    const connecting = mic.setInput(createFakeTrack("audio", "mic"));
    await flush();
    mic.dispose();
    loaded();
    await connecting;

    // Assert
    expect(capture.level("mute")?.disposed).toBe(true);
  });

  it("keeps the sends open while a broken gate can't drive them", async () => {
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    s.capture().gates[0]?.fail(new Error("processorerror"));

    expect(s.capture().level("send")?.following).toBeNull();
    expect(s.capture().level("send")?.level).toBe(1);
    expect(s.capture().level("post feed")?.level).toBe(1);
  });

  it("without k-rate gains, moves the sends on the gate's messages", async () => {
    const s = setup({ canFollow: false });
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    const send = s.capture().level("send");
    const closed = send?.level;

    s.capture().gates[0]?.emit(true);
    const open = send?.level;
    s.capture().gates[0]?.emit(false);

    expect([closed, open, send?.level]).toEqual([0, 1, 0]);
  });

  it("fades a send effect the player turned off, then disposes it", async () => {
    // Arrange
    vi.useFakeTimers();
    const s = setup();
    const reverb = fakeEffect("reverb", { defaultPlace: "send" });
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    s.mic.setEffects([reverb.definition], new Set(["reverb"]));
    await vi.advanceTimersByTimeAsync(0);
    const instance = reverb.instances[0];

    // Act
    s.mic.setEffects([reverb.definition], new Set());
    const during = instance?.disposed;
    await vi.advanceTimersByTimeAsync(60);

    // Assert
    expect(s.mic.effectStatus("reverb").status).toBe("off");
    expect(during).toBe(false);
    expect(instance?.disposed).toBe(true);
    vi.useRealTimers();
  });

  it("cuts a failed send effect at once, and carries the voice on the dry path", async () => {
    const s = setup();
    const reverb = fakeEffect("reverb", { defaultPlace: "send" });
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    s.mic.setEffects([reverb.definition], new Set(["reverb"]));
    await flush();

    reverb.contexts[0]?.fail(new Error("broken"));

    expect(reverb.instances[0]?.disposed).toBe(true);
    expect(s.capture().level("return:reverb")?.disposed).toBe(true);
    expect(s.capture().level("channel")?.level).toBe(1);
  });

  it("hosts a kernel for an effect, with its tail and its failure path", async () => {
    // Arrange
    const s = setup();
    const definition: AudioEffectDefinition = {
      ...fakeEffect("reverb", { defaultPlace: "send" }).definition,
      tail: 2,
      create: ({ host }) => host({ module: "/reverb.js", name: "reverb" }),
    };
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    // Act
    s.mic.setEffects([definition], new Set(["reverb"]));
    await flush();

    // Assert
    const hosted = s.env.hosted[0];
    expect(s.mic.effectStatus("reverb").status).toBe("running");
    expect(hosted?.kernel).toEqual({ module: "/reverb.js", name: "reverb" });
    expect(hosted?.options.tail).toBe(2);

    hosted?.options.fail(new Error("kernel broke"));
    expect(s.mic.effectStatus("reverb").status).toBe("failed");
    expect(hosted?.disposed).toBe(true);
  });

  it("opens and closes mute on its own, and never without a device", async () => {
    // Arrange
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    const mute = s.capture().level("mute");

    // Act
    const before = mute?.level;
    s.mic.setVoiceOpen(true);
    const open = mute?.level;
    s.mic.setVoiceOpen(false);
    const closed = mute?.level;
    s.mic.setVoiceOpen(true);
    await s.mic.setInput(null);

    // Assert
    expect([before, open, closed, mute?.level]).toEqual([0, 1, 0, 0]);
  });

  it("keeps the output disabled until enabled, and without a device", async () => {
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    const output = s.capture().output;
    const before = output.enabled;

    s.mic.setEnabled(true);
    const enabled = output.enabled;
    await s.mic.setInput(null);
    const withoutDevice = output.enabled;
    await s.mic.setInput(createFakeTrack("audio", "mic2"));

    expect([before, enabled, withoutDevice]).toEqual([false, true, false]);
    expect(output.enabled).toBe(true);
  });

  it("sends an unchanged gate configuration only once", async () => {
    const s = setup();
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    s.mic.setGate({ ...GATE });
    s.mic.setGate({ ...GATE, auto: false });
    s.mic.setGate({ ...GATE, auto: false });

    expect(s.capture().gates[0]?.configs).toEqual([
      GATE,
      { ...GATE, auto: false },
    ]);
  });

  it("forwards the gate's transitions", async () => {
    const s = setup();
    const transitions = vi.fn();
    s.mic.onGate(transitions);
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    s.capture().gates[0]?.emit(true);
    s.capture().gates[0]?.emit(false);

    expect(transitions.mock.calls).toEqual([[true], [false]]);
  });

  it("runs wanted effects in the capture context, by place, around the gate", async () => {
    const s = setup();
    const post = fakeEffect("eq", { defaultPlace: "post-gate" });
    const denoise = fakeEffect("rnnoise", { defaultPlace: "pre-gate" });
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    s.mic.setEffects(
      [post.definition, denoise.definition],
      new Set(["eq", "rnnoise"]),
    );
    await flush();

    const capture = s.capture();
    expect(denoise.contexts[0]?.audioContext).toBe(capture.audioContext);
    expect(s.mic.effectStatus("rnnoise").status).toBe("running");
    const source = capture.sources[0]?.node;
    const eq = post.instances[0]?.input;
    const rnnoise = denoise.instances[0]?.output;
    expect(source && eq && rnnoise).toBeTruthy();
    if (!source || !eq || !rnnoise) return;
    expect(capture.graph.reaches(source, rnnoise)).toBe(true);
    expect(capture.graph.reaches(rnnoise, eq)).toBe(true);
    expect(capture.graph.edges()).not.toContain("source:mic->gate");
  });

  it("runs noise suppression first, whatever started first", async () => {
    const s = setup();
    const pitch = fakeEffect("pitch");
    const denoise = fakeEffect("rnnoise", { group: "noise-suppression" });
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    s.mic.setEffects(
      [pitch.definition, denoise.definition],
      new Set(["pitch", "rnnoise"]),
    );
    await flush();

    const rnnoise = denoise.instances[0]?.output;
    const shifted = pitch.instances[0]?.input;
    if (!rnnoise || !shifted) throw new Error("not running");
    expect(s.capture().graph.reaches(rnnoise, shifted)).toBe(true);
  });

  it("starts effects wanted before the device, once it is in", async () => {
    const s = setup();
    const denoise = fakeEffect("rnnoise");

    s.mic.setEffects([denoise.definition], new Set(["rnnoise"]));
    const before = s.mic.effectStatus("rnnoise").status;
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    await flush();

    expect(before).toBe("off");
    expect(s.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("stops effects without a device, and starts them again with one", async () => {
    const s = setup();
    const denoise = fakeEffect("rnnoise");
    s.mic.setEffects([denoise.definition], new Set(["rnnoise"]));
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    await flush();

    await s.mic.setInput(null);
    const stopped = denoise.instances[0]?.disposed;
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    await flush();

    expect(stopped).toBe(true);
    expect(denoise.instances).toHaveLength(2);
    expect(s.mic.effectStatus("rnnoise").status).toBe("running");
  });

  it("goes on without an effect that failed to start", async () => {
    const s = setup();
    const broken = fakeEffect("rnnoise", {
      fail: new DOMException("no wasm", "CompileError"),
    });
    await s.mic.setInput(createFakeTrack("audio", "mic"));

    s.mic.setEffects([broken.definition], new Set(["rnnoise"]));
    await flush();

    expect(s.mic.effectStatus("rnnoise")).toEqual({
      status: "failed",
      error: "CompileError",
    });
    expect(s.capture().graph.edges()).toEqual([
      "source:mic->gate",
      "gate->mute",
      "mute->post feed",
      "post feed->channel",
      "channel->destination",
    ]);
  });

  it("disposes the chain, the gate and the effects", async () => {
    const s = setup();
    const denoise = fakeEffect("rnnoise");
    s.mic.setEffects([denoise.definition], new Set(["rnnoise"]));
    await s.mic.setInput(createFakeTrack("audio", "mic"));
    await flush();

    s.mic.dispose();

    expect(denoise.instances[0]?.disposed).toBe(true);
    expect(s.capture().gates[0]?.disposed).toBe(true);
    expect(s.capture().running).toBe(false);
  });
});
