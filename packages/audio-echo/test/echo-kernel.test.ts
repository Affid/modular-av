import { beforeAll, describe, expect, it } from "vitest";

interface Kernel {
  render(input: Float32Array, output: Float32Array): void;
  configure(value: unknown): void;
}
type KernelClass = new (init: {
  sampleRate: number;
  options: unknown;
}) => Kernel;

const BLOCK = 128;
const RATE = 48_000;
/** What the module declares: nothing may ring past this. */
const TAIL_S = 3;

let Echo: KernelClass;

beforeAll(async () => {
  const kernels = new Map<string, KernelClass>();
  (globalThis as { modularAV?: unknown }).modularAV = {
    registerAudioKernel: (name: string, kernel: KernelClass) =>
      kernels.set(name, kernel),
  };
  // @ts-expect-error -- a plain worklet script without types
  await import("../public/worklets/echo.js");
  const found = kernels.get("modular-av-audio-echo");
  if (!found) throw new Error("no kernel");
  Echo = found;
});

function run(
  kernel: Kernel,
  frames: number,
  source: (frame: number) => number,
): Float32Array {
  const output = new Float32Array(frames);
  const input = new Float32Array(BLOCK);
  const block = new Float32Array(BLOCK);
  for (let at = 0; at + BLOCK <= frames; at += BLOCK) {
    for (let i = 0; i < BLOCK; i += 1) input[i] = source(at + i);
    kernel.render(input, block);
    output.set(block, at);
  }
  return output;
}

const peakOf = (samples: Float32Array): number =>
  samples.reduce((most, s) => Math.max(most, Math.abs(s)), 0);

const impulse = (frame: number): number => (frame === 0 ? 1 : 0);

const echoOf = (time: number, decay: number, sampleRate = RATE): Kernel =>
  new Echo({ sampleRate, options: { time, decay } });

/** The loudest in `span` seconds around `at`. */
const around = (output: Float32Array, at: number, span = 0.005): number =>
  peakOf(
    output.subarray(
      Math.round((at - span) * RATE),
      Math.round((at + span) * RATE),
    ),
  );

describe("the echo kernel", () => {
  it("repeats after its time, no dry signal before it", () => {
    // Act
    const output = run(echoOf(0.3, 1.5), RATE, impulse);

    // Assert
    expect(peakOf(output.subarray(0, Math.round(0.29 * RATE)))).toBe(0);
    expect(around(output, 0.3)).toBeGreaterThan(0.9);
  });

  it("dies away, each repeat by the same amount", () => {
    const output = run(echoOf(0.3, 1.5), RATE * 2, impulse);

    const first = around(output, 0.3);
    const second = around(output, 0.6);
    const third = around(output, 0.9);

    expect(second).toBeLessThan(first);
    expect(third / second).toBeCloseTo(second / first, 1);
  });

  it.each([
    [0.05, 3],
    [0.3, 3],
    [0.6, 3],
    [0.6, 0.3],
  ])(
    "has ended 60 dB down by the declared tail at time %d, decay %d",
    (time, decay) => {
      // Arrange: under the knee even as repeats overlap: a bent peak would
      // flatter nothing.
      const burstFrames = 0.2 * RATE;
      const noise = (frame: number): number =>
        frame < burstFrames ? (frame % 2 ? 0.1 : -0.1) : 0;

      // Act
      const output = run(echoOf(time, decay), RATE * 5, noise);

      // Assert
      const end = Math.round((0.2 + TAIL_S + 0.05) * RATE);
      expect(peakOf(output.subarray(end))).toBeLessThanOrEqual(
        peakOf(output) * 0.001,
      );
    },
  );

  it("gives one repeat when decay is no longer than its time", () => {
    const output = run(echoOf(0.6, 0.3), RATE * 2, impulse);

    expect(around(output, 0.6)).toBeGreaterThan(0.9);
    expect(around(output, 1.2)).toBe(0);
  });

  it("stays finite and in range under a loud steady tone at its longest", () => {
    const tone = (frame: number): number =>
      0.5 * Math.sin((2 * Math.PI * 440 * frame) / RATE);

    const output = run(echoOf(0.05, 3), RATE * 4, tone);

    expect(output.every((s) => Number.isFinite(s))).toBe(true);
    expect(peakOf(output)).toBeLessThanOrEqual(1);
  });

  it("glides to a new time without a jump", () => {
    // Arrange: a steady tone in the line.
    const kernel = echoOf(0.3, 3);
    const tone = (frame: number): number =>
      0.25 * Math.sin((2 * Math.PI * 220 * frame) / RATE);
    run(kernel, RATE, tone);

    // Act
    kernel.configure({ time: 0.5, decay: 3 });
    const moved = run(kernel, BLOCK * 90, (frame) => tone(frame + RATE));

    // Assert: no sample leaps further than the tone itself could.
    const steps = moved
      .subarray(1)
      .map((s, i) => Math.abs(s - (moved[i] ?? 0)));
    expect(peakOf(steps)).toBeLessThan(0.08);
  });

  it("keeps within range whatever it is sent", () => {
    // Arrange
    const kernel = echoOf(0.3, 1.5);

    // Act
    kernel.configure({ time: 99, decay: Number.NaN });
    const output = run(kernel, RATE * 2, impulse);

    // Assert: the longest time, the decay it had.
    expect(output.every((s) => Number.isFinite(s))).toBe(true);
    expect(around(output, 0.6, 0.01)).toBeGreaterThan(0.5);
  });

  it("sits at any rate the context has", () => {
    const sampleRate = 96_000;

    const output = run(echoOf(0.6, 1.5, sampleRate), sampleRate, impulse);

    expect(peakOf(output.subarray(0, Math.round(0.59 * sampleRate)))).toBe(0);
    expect(peakOf(output)).toBeGreaterThan(0.9);
  });
});
