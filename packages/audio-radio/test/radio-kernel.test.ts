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
/** What the module declares: nothing may sound past this. */
const TAIL_S = 0.3;
/** What the tail contract lets straight through: a first echo. */
const DRY_LEAK = 0.25;

const QUIET = { drive: 0, static: 0, squelch: 0 };
const LOUDEST = { drive: 1, static: 1, squelch: 1 };
const DEFAULTS = { drive: 0.5, static: 0.3, squelch: 0.5 };

let Radio: KernelClass;

beforeAll(async () => {
  const kernels = new Map<string, KernelClass>();
  (globalThis as { modularAV?: unknown }).modularAV = {
    registerAudioKernel: (name: string, kernel: KernelClass) =>
      kernels.set(name, kernel),
  };
  // @ts-expect-error -- a plain worklet script without types
  await import("../public/worklets/radio.js");
  const found = kernels.get("modular-av-audio-radio");
  if (!found) throw new Error("no kernel");
  Radio = found;
});

const radioOf = (options: unknown, sampleRate = RATE): Kernel =>
  new Radio({ sampleRate, options });

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

const rmsOf = (samples: Float32Array): number =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

const tone =
  (hz: number, level: number, seconds = Infinity, sampleRate = RATE) =>
  (frame: number): number =>
    frame < seconds * sampleRate
      ? level * Math.sin((2 * Math.PI * hz * frame) / sampleRate)
      : 0;

const span = (output: Float32Array, from: number, to: number): Float32Array =>
  output.subarray(Math.round(from * RATE), Math.round(to * RATE));

/** RMS of a steady tone once the filters have settled. */
const settled = (kernel: Kernel, source: (frame: number) => number): number =>
  rmsOf(span(run(kernel, RATE / 2, source), 0.25, 0.5));

const db = (ratio: number): number => 20 * Math.log10(ratio);

describe("the radio kernel", () => {
  it("keeps the middle of the voice and cuts its lows and highs", () => {
    const at = (hz: number): number => settled(radioOf(QUIET), tone(hz, 0.1));

    const middle = at(1000);

    expect(db(at(80) / middle)).toBeLessThan(-20);
    expect(db(at(10_000) / middle)).toBeLessThan(-20);
  });

  it("is about as loud as the voice it is given", () => {
    const level = 0.1;

    const out = settled(radioOf(DEFAULTS), tone(1000, level));

    expect(Math.abs(db(out / (level / Math.SQRT2)))).toBeLessThan(6);
  });

  it("squeezes loud and quiet together as the drive goes up", () => {
    const spread = (drive: number): number =>
      db(
        settled(radioOf({ ...QUIET, drive }), tone(1000, 0.5)) /
          settled(radioOf({ ...QUIET, drive }), tone(1000, 0.05)),
      );

    expect(spread(0)).toBeCloseTo(20, 0);
    expect(spread(1)).toBeLessThan(10);
  });

  it("hisses under the voice with static, and stops when the voice does", () => {
    // Arrange
    const voice = tone(1000, 0.1, 0.5);
    const clean = run(radioOf(QUIET), RATE, voice);

    // Act
    const hissing = run(radioOf({ ...QUIET, static: 1 }), RATE, voice);

    // Assert
    const noise = hissing.map((s, i) => s - (clean[i] ?? 0));
    expect(rmsOf(span(noise, 0.1, 0.5))).toBeGreaterThan(0.005);
    expect(peakOf(span(noise, 0.5 + TAIL_S, 1))).toBeLessThan(0.0005);
  });

  it("makes no sound of its own on silence", () => {
    const output = run(radioOf(LOUDEST), RATE, () => 0);

    expect(peakOf(output)).toBe(0);
  });

  it("gives a burst of squelch once a transmission ends, and nothing past its tail", () => {
    // Act
    const output = run(
      radioOf({ ...QUIET, squelch: 1 }),
      RATE,
      tone(1000, 0.1, 0.4),
    );

    // Assert
    const burst = span(output, 0.42, 0.55);
    expect(rmsOf(burst)).toBeGreaterThan(0.02);
    expect(peakOf(span(output, 0.4 + TAIL_S - 0.05, 1))).toBeLessThanOrEqual(
      peakOf(output) * 0.001,
    );
  });

  it("gives no squelch with it at 0", () => {
    const output = run(radioOf(QUIET), RATE, tone(1000, 0.1, 0.4));

    expect(peakOf(span(output, 0.42, 1))).toBeLessThan(0.001);
  });

  it("gives no squelch for a click, only for speech", () => {
    const click = (frame: number): number => (frame < 64 ? 0.3 : 0);

    const output = run(radioOf({ ...LOUDEST, static: 0 }), RATE, click);

    expect(peakOf(span(output, 0.02, 1))).toBeLessThan(0.001);
  });

  it("gives no squelch while the voice only pauses, in room sound", () => {
    // Arrange: speech, then a quiet room the gate lets through.
    const voice = tone(1000, 0.1, 0.4);
    const room = (frame: number): number =>
      voice(frame) || 0.0005 * Math.sin(frame);

    // Act
    const output = run(radioOf({ ...QUIET, squelch: 1 }), RATE, room);

    // Assert
    expect(rmsOf(span(output, 0.42, 0.55))).toBeLessThan(0.002);
  });

  it.each([
    ["at its defaults", DEFAULTS],
    ["at its loudest", LOUDEST],
  ])(
    "lets less of an impulse through than a dry signal would, %s",
    (_, settings) => {
      // Arrange: as the tail contract measures it, in 10 ms blocks.
      const at = 0.1;
      const impulse = (frame: number): number =>
        frame === Math.round(at * RATE) ? 1 : 0;

      // Act
      const output = run(radioOf(settings), RATE / 2, impulse);

      // Assert
      expect(peakOf(span(output, at, at + 0.01))).toBeLessThanOrEqual(DRY_LEAK);
    },
  );

  it("stays finite and in range under a full scale tone at its loudest", () => {
    const output = run(radioOf(LOUDEST), RATE, tone(1000, 1));

    expect(output.every((s) => Number.isFinite(s))).toBe(true);
    expect(peakOf(output)).toBeLessThanOrEqual(1);
  });

  it("keeps within range whatever it is sent", () => {
    // Arrange
    const kernel = radioOf(QUIET);

    // Act
    kernel.configure({ drive: Number.NaN, static: "loud", squelch: 99 });
    const output = run(kernel, RATE, tone(1000, 0.1, 0.4));

    // Assert: the drive and static it had, squelch at most.
    expect(output.every((s) => Number.isFinite(s))).toBe(true);
    expect(peakOf(output)).toBeLessThanOrEqual(1);
    expect(rmsOf(span(output, 0.42, 0.55))).toBeGreaterThan(0.02);
    expect(peakOf(span(output, 0.4 + TAIL_S - 0.05, 1))).toBeLessThan(0.0001);
  });

  it("sits at any rate the context has", () => {
    const sampleRate = 96_000;
    const at = (hz: number): number =>
      rmsOf(
        run(
          radioOf(QUIET, sampleRate),
          sampleRate / 2,
          tone(hz, 0.1, Infinity, sampleRate),
        ).subarray(sampleRate / 4),
      );

    expect(db(at(10_000) / at(1000))).toBeLessThan(-20);
  });
});
