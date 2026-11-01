import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface Processor {
  readonly port: { onmessage: ((event: { data: unknown }) => void) | null };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

type ProcessorClass = new (options: {
  processorOptions?: unknown;
}) => Processor;

interface Kernel {
  render(input: Float32Array, output: Float32Array): void;
  configure?(value: unknown): void;
}

type KernelClass = new (init: {
  sampleRate: number;
  options: unknown;
}) => Kernel;

const SAMPLE_RATE = 48_000;
const BLOCK = 128;
const PROCESSOR = "modular-av-effect-host";

let Host: ProcessorClass;
let registerAudioKernel: (name: string, kernel: KernelClass) => void;
let posted: unknown[] = [];
let renders = 0;
let lastInit: { sampleRate: number; options: unknown } | null = null;
let configured: unknown[] = [];

class Doubler implements Kernel {
  constructor(init: { sampleRate: number; options: unknown }) {
    lastInit = init;
  }
  render(input: Float32Array, output: Float32Array): void {
    renders += 1;
    input.forEach((sample, i) => {
      output[i] = sample * 2;
    });
  }
  configure(value: unknown): void {
    configured = [...configured, value];
  }
}

class Thrower implements Kernel {
  render(): void {
    throw new Error("broken render");
  }
}

class Poison implements Kernel {
  render(_input: Float32Array, output: Float32Array): void {
    output.fill(Number.NaN);
  }
}

beforeAll(async () => {
  const registered = new Map<string, ProcessorClass>();
  vi.stubGlobal("sampleRate", SAMPLE_RATE);
  vi.stubGlobal(
    "AudioWorkletProcessor",
    class {
      readonly port = {
        onmessage: null,
        postMessage: (message: unknown) => {
          posted.push(message);
        },
      };
    },
  );
  vi.stubGlobal("registerProcessor", (name: string, cls: ProcessorClass) => {
    registered.set(name, cls);
  });
  // @ts-expect-error -- a plain worklet script without types
  await import("../public/worklets/effect-host.js");
  const cls = registered.get(PROCESSOR);
  if (!cls) throw new Error(`${PROCESSOR} was not registered`);
  Host = cls;
  registerAudioKernel = (
    globalThis as unknown as {
      modularAV: { registerAudioKernel: typeof registerAudioKernel };
    }
  ).modularAV.registerAudioKernel;
  registerAudioKernel("doubler", Doubler);
  registerAudioKernel("thrower", Thrower);
  registerAudioKernel("poison", Poison);
});

beforeEach(() => {
  posted = [];
  renders = 0;
  lastInit = null;
  configured = [];
});

const sound = (): Float32Array => new Float32Array(BLOCK).fill(0.25);
const silence = (): Float32Array => new Float32Array(BLOCK);

const run = (host: Processor, input: Float32Array | null): Float32Array => {
  const output = new Float32Array(BLOCK);
  host.process([input ? [input] : []], [[output]]);
  return output;
};

const host = (kernel: string, tail = 0, options?: unknown): Processor =>
  new Host({ processorOptions: { kernel, tail, options } });

describe("effect host worklet", () => {
  it("gives the kernel its sample rate and options", () => {
    host("doubler", 0, { size: 3 });

    expect(lastInit).toEqual({ sampleRate: SAMPLE_RATE, options: { size: 3 } });
  });

  it("renders while there is sound", () => {
    const h = host("doubler");

    const output = run(h, sound());

    expect(output[0]).toBe(0.5);
    expect(renders).toBe(1);
  });

  it("never calls a kernel with no tail on silence", () => {
    const h = host("doubler");
    run(h, sound());
    renders = 0;

    for (let i = 0; i < 100; i += 1) run(h, silence());
    run(h, null);

    expect(renders).toBe(0);
  });

  it("wakes on the same block sound comes back", () => {
    const h = host("doubler");
    run(h, silence());

    const output = run(h, sound());

    expect(output[0]).toBe(0.5);
  });

  it("keeps rendering for the declared tail, then stops", () => {
    // Arrange
    const h = host("doubler", (1000 * BLOCK) / SAMPLE_RATE);
    run(h, sound());
    renders = 0;

    // Act
    for (let i = 0; i < 1500; i += 1) run(h, silence());

    // Assert
    expect(renders).toBe(1000);
  });

  it.each([Number.NaN, Infinity, -1])(
    "treats a tail of %s as none, so it can't run on silence forever",
    (tail) => {
      const h = host("doubler", tail);
      run(h, sound());
      renders = 0;

      run(h, silence());

      expect(renders).toBe(0);
    },
  );

  it("feeds zeros through a tail when the input has no channels", () => {
    const h = host("doubler", 1);
    run(h, sound());

    expect(run(h, null)[0]).toBe(0);
    expect(renders).toBe(2);
  });

  it("passes configuration to the kernel", () => {
    const h = host("doubler");

    h.port.onmessage?.({ data: { wet: 0.5 } });

    expect(configured).toEqual([{ wet: 0.5 }]);
  });

  it("reports a kernel that throws, sends silence and never calls it again", () => {
    const h = host("thrower");

    const first = run(h, sound());
    const second = run(h, sound());

    expect(posted).toEqual([{ type: "failed", error: "Error: broken render" }]);
    expect(first.every((s) => s === 0)).toBe(true);
    expect(second.every((s) => s === 0)).toBe(true);
  });

  it("reports a kernel that outputs a non-number, and sends silence", () => {
    const h = host("poison");

    const output = run(h, sound());

    expect(output.every((s) => s === 0)).toBe(true);
    expect(posted).toEqual([
      { type: "failed", error: "Error: The kernel's output isn't a number" },
    ]);
  });

  it("reports a kernel that isn't registered", () => {
    const h = host("nothing");

    const output = run(h, sound());

    expect(output.every((s) => s === 0)).toBe(true);
    expect(posted).toEqual([
      { type: "failed", error: 'Error: No kernel named "nothing"' },
    ]);
  });
});
