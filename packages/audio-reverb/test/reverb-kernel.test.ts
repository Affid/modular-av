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
/** What the module declares: nothing may ring past this. */
const TAIL_S = 3;
const MAX_DECAY = { decay: 3, brightness: 1 };
const BURST_LEVEL = 0.2;

let Reverb: KernelClass;

beforeAll(async () => {
  const kernels = new Map<string, KernelClass>();
  (globalThis as { modularAV?: unknown }).modularAV = {
    registerAudioKernel: (name: string, kernel: KernelClass) =>
      kernels.set(name, kernel),
  };
  // @ts-expect-error -- a worklet file, with no types.
  await import("../public/worklets/reverb.js");
  const found = kernels.get("modular-av-audio-reverb");
  if (!found) throw new Error("no kernel");
  Reverb = found;
});

/** Runs `source(frame)` through, in blocks, and returns the output. */
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

/** Noise, loud but under the knee: a bent peak would flatter no decay. */
function burst(sampleRate: number, seconds: number) {
  const frames = Math.round(sampleRate * seconds);
  let seed = 1;
  return (frame: number): number => {
    if (frame >= frames) return 0;
    seed = (seed * 16807) % 2147483647;
    return ((seed / 2147483647) * 2 - 1) * BURST_LEVEL;
  };
}

describe("the reverb kernel", () => {
  it.each([48_000, 44_100, 96_000])(
    "has ended 60 dB down by the declared tail at its longest decay, at %d Hz",
    (sampleRate) => {
      // Arrange
      const kernel = new Reverb({ sampleRate, options: MAX_DECAY });
      const burstS = 0.2;

      // Act
      const output = run(
        kernel,
        Math.round(sampleRate * (burstS + TAIL_S + 0.5)),
        burst(sampleRate, burstS),
      );

      // Assert
      const end = Math.round(sampleRate * (burstS + TAIL_S));
      expect(peakOf(output.subarray(end))).toBeLessThanOrEqual(
        peakOf(output) * 0.001,
      );
    },
  );

  it("rings for about as long as its decay says", () => {
    // Arrange
    const sampleRate = 48_000;
    const ringing = (decay: number): number => {
      const kernel = new Reverb({
        sampleRate,
        options: { decay, brightness: 1 },
      });
      const output = run(kernel, sampleRate * 4, burst(sampleRate, 0.1));
      const blocks = Math.floor(output.length / 4800);
      const loud = Array.from({ length: blocks }, (_, i) =>
        peakOf(output.subarray(i * 4800, (i + 1) * 4800)),
      );
      const peak = Math.max(...loud);
      return loud.findLastIndex((p) => p > peak * 0.001) * 0.1;
    };

    // Act and assert: audibly different, in order, and honest.
    const short = ringing(0.5);
    const long = ringing(2.5);
    expect(short).toBeGreaterThan(0.3);
    expect(short).toBeLessThan(0.8);
    expect(long).toBeGreaterThan(2);
    expect(long).toBeLessThan(2.8);
  });

  it("sends no dry signal: nothing before its first reflection", () => {
    const sampleRate = 48_000;
    const kernel = new Reverb({ sampleRate, options: MAX_DECAY });

    const output = run(kernel, BLOCK * 8, (frame) => (frame === 0 ? 1 : 0));

    expect(peakOf(output.subarray(0, BLOCK * 8))).toBe(0);
  });

  it("stays in range on a loud steady tone, at every setting", () => {
    const sampleRate = 48_000;
    for (const decay of [0.3, 1.5, 3])
      for (const brightness of [0, 1]) {
        // Arrange
        const kernel = new Reverb({
          sampleRate,
          options: { decay, brightness },
        });
        const tone = (frame: number): number =>
          0.5 * Math.sin((2 * Math.PI * 440 * frame) / sampleRate);

        // Act
        const output = run(kernel, sampleRate * 2, tone);

        // Assert
        expect(peakOf(output)).toBeLessThan(1);
      }
  });

  it("leaves speech-like sound unbent: it scales with what comes in", () => {
    // Arrange: a voiced sound at -12 dBFS, swelling four times a second.
    const sampleRate = 48_000;
    const voice =
      (gain: number) =>
      (frame: number): number => {
        const at = (2 * Math.PI * frame) / sampleRate;
        return gain * (0.5 + 0.5 * Math.sin(4 * at)) * Math.sin(140 * at);
      };
    const peak = (gain: number): number =>
      peakOf(
        run(
          new Reverb({ sampleRate, options: { decay: 1.5, brightness: 0.5 } }),
          sampleRate,
          voice(gain),
        ),
      );

    // Act and assert
    expect(peak(0.25)).toBeCloseTo(peak(0.125) * 2, 5);
  });

  it("gets duller as brightness falls", () => {
    // Arrange: how much of the output is high frequency.
    const sampleRate = 48_000;
    const edge = (brightness: number): number => {
      const kernel = new Reverb({
        sampleRate,
        options: { decay: 1.5, brightness },
      });
      const output = run(kernel, sampleRate, burst(sampleRate, 0.1));
      return output
        .subarray(sampleRate / 2)
        .reduce((sum, s, i, all) => sum + Math.abs(s - (all[i - 1] ?? 0)), 0);
    };

    // Act and assert
    expect(edge(0)).toBeLessThan(edge(1) * 0.8);
  });

  it("takes a new decay while it runs, in range whatever it is sent", () => {
    // Arrange
    const sampleRate = 48_000;
    const kernel = new Reverb({ sampleRate, options: MAX_DECAY });

    // Act
    kernel.configure({ decay: 0.3, brightness: 0.5 });
    const shortened = run(kernel, sampleRate * 2, burst(sampleRate, 0.1));
    kernel.configure({ decay: 99, brightness: Number.NaN });
    const clamped = run(kernel, sampleRate * 4, burst(sampleRate, 0.1));

    // Assert
    expect(peakOf(shortened.subarray(sampleRate))).toBeLessThan(
      peakOf(shortened) * 0.001,
    );
    expect(
      peakOf(clamped.subarray(Math.round(sampleRate * (0.1 + TAIL_S)))),
    ).toBeLessThanOrEqual(peakOf(clamped) * 0.001);
    expect(clamped.every((s) => Number.isFinite(s))).toBe(true);
  });
});
