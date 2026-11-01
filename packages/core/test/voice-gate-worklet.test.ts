import { beforeAll, describe, expect, it, vi } from "vitest";

/** The shape of the worklet's processor, as this test drives it. */
interface Processor {
  readonly port: { onmessage: ((event: { data: unknown }) => void) | null };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

type ProcessorClass = new (options: {
  processorOptions?: unknown;
}) => Processor;

const SAMPLE_RATE = 48_000;
const BLOCK = 128;
const PROCESSOR = "modular-av-voice-gate";

let Gate: ProcessorClass;

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
  await import("../public/worklets/voice-gate.js");
  const cls = registered.get(PROCESSOR);
  if (!cls) throw new Error(`${PROCESSOR} was not registered`);
  Gate = cls;
});

let posted: unknown[] = [];

/** A sine block whose RMS level is `db` dBFS; -Infinity for silence. */
function block(db: number, offset: number): Float32Array {
  const amplitude = db === -Infinity ? 0 : Math.SQRT2 * 10 ** (db / 20);
  return Float32Array.from(
    { length: BLOCK },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 440 * (offset + i)) / 48_000),
  );
}

interface Run {
  readonly outputs: Float32Array[];
  readonly messages: unknown[];
}

let clock = 0;

/** Feeds `seconds` of a tone at `db` and collects what came out. */
function feed(gate: Processor, db: number, seconds: number): Run {
  posted = [];
  const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK);
  const outputs = Array.from({ length: blocks }, () => {
    const input = block(db, clock);
    clock += BLOCK;
    const output = new Float32Array(BLOCK);
    gate.process([[input]], [[output]]);
    return output;
  });
  return { outputs, messages: posted };
}

const peak = (outputs: readonly Float32Array[]): number =>
  Math.max(...outputs.map((o) => Math.max(...o.map(Math.abs))));

const transitions = (messages: readonly unknown[]): unknown[] =>
  messages.filter((m) => (m as { type?: string }).type === "open");

interface Controls {
  readonly sound: Float32Array;
  readonly feed: Float32Array;
  readonly sends: Float32Array;
}

const peakOf = (samples: Float32Array): number =>
  samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);

const send = (gate: Processor, data: unknown): void => {
  gate.port.onmessage?.({ data });
};

describe("voice gate worklet", () => {
  it("in gate mode, silences quiet input and passes speech", () => {
    // Arrange
    const gate = new Gate({ processorOptions: { mode: "gate" } });

    // Act
    const quiet = feed(gate, -70, 1);
    const speech = feed(gate, -15, 0.5);

    // Assert
    expect(peak(quiet.outputs)).toBe(0);
    expect(transitions(quiet.messages)).toEqual([]);
    expect(peak(speech.outputs.slice(-10))).toBeGreaterThan(0.2);
    expect(transitions(speech.messages)).toEqual([
      { type: "open", open: true },
    ]);
  });

  it("closes once after the hold time, ramping to digital silence", () => {
    const gate = new Gate({ processorOptions: { mode: "gate" } });
    feed(gate, -70, 1);
    feed(gate, -30, 0.5);

    // The level falls at about 70 dB/s, then the gate holds for 300 ms.
    const held = feed(gate, -70, 0.25);
    const after = feed(gate, -70, 0.75);

    expect(transitions(held.messages)).toEqual([]);
    expect(transitions(after.messages)).toEqual([
      { type: "open", open: false },
    ]);
    expect(peak(after.outputs.slice(-10))).toBe(0);
  });

  it("in detect mode, passes everything but still reports transitions", () => {
    const gate = new Gate({ processorOptions: { mode: "detect" } });

    const quiet = feed(gate, -70, 1);
    const speech = feed(gate, -15, 0.5);

    expect(peak(quiet.outputs)).toBeGreaterThan(0);
    expect(transitions(speech.messages)).toEqual([
      { type: "open", open: true },
    ]);
  });

  it("tells gains on the audio thread when the post feed and the sends may close", () => {
    // Arrange
    const gate = new Gate({
      processorOptions: { mode: "gate", auto: false, threshold: -40 },
    });
    const run = (db: number, seconds: number): Controls[] => {
      const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK);
      return Array.from({ length: blocks }, () => {
        const input = block(db, clock);
        clock += BLOCK;
        const sound = new Float32Array(BLOCK);
        const feed = new Float32Array(BLOCK);
        const sends = new Float32Array(BLOCK);
        gate.process([[input]], [[sound], [feed], [sends]]);
        return { sound, feed, sends };
      });
    };

    // Act
    const quiet = run(-70, 0.2);
    const speech = run(-15, 0.5);
    const pause = run(-70, 1);

    // Assert: shut only while the gate passes nothing, and open with its
    // first block of sound, so a following gain can't clip speech.
    expect(quiet.every((c) => c.feed[0] === 0 && c.sends[0] === 0)).toBe(true);
    expect(speech[0]?.feed[0]).toBe(1);
    expect(speech.at(-1)?.sends[0]).toBe(1);
    for (const c of [...speech, ...pause])
      if (peakOf(c.sound) > 0) expect(c.feed[0]).toBe(1);
    expect(pause.at(-1)?.feed[0]).toBe(0);
    const closing = pause.map((c) => c.sends[0] ?? 0);
    expect(closing.at(-1)).toBe(0);
    expect(closing.some((level) => level > 0 && level < 1)).toBe(true);
  });

  it("in detect mode, keeps the post feed open but closes the sends in a pause", () => {
    const gate = new Gate({
      processorOptions: { mode: "detect", auto: false, threshold: -40 },
    });
    const run = (db: number, seconds: number): Controls[] => {
      const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK);
      return Array.from({ length: blocks }, () => {
        const input = block(db, clock);
        clock += BLOCK;
        const sound = new Float32Array(BLOCK);
        const feed = new Float32Array(BLOCK);
        const sends = new Float32Array(BLOCK);
        gate.process([[input]], [[sound], [feed], [sends]]);
        return { sound, feed, sends };
      });
    };

    run(-15, 0.5);
    const pause = run(-70, 1);

    expect(pause.at(-1)?.feed[0]).toBe(1);
    expect(pause.at(-1)?.sends[0]).toBe(0);
  });

  it("uses a fixed threshold when auto is off, also when configured later", () => {
    const gate = new Gate({
      processorOptions: { mode: "gate", auto: false, threshold: -20 },
    });

    const below = feed(gate, -30, 0.5);
    send(gate, { type: "configure", threshold: -40 });
    const above = feed(gate, -30, 0.5);

    expect(transitions(below.messages)).toEqual([]);
    expect(transitions(above.messages)).toEqual([{ type: "open", open: true }]);
  });

  it("switches mode while running", () => {
    const gate = new Gate({ processorOptions: { mode: "detect" } });
    feed(gate, -70, 1);

    send(gate, { type: "configure", mode: "gate" });
    const quiet = feed(gate, -70, 0.2);

    expect(peak(quiet.outputs.slice(-10))).toBe(0);
  });

  it("reports levels only while asked, at most 20 times a second", () => {
    const gate = new Gate({ processorOptions: { mode: "gate" } });

    const silent = feed(gate, -70, 0.5);
    send(gate, { type: "levels", enabled: true });
    const metered = feed(gate, -70, 1);
    send(gate, { type: "levels", enabled: false });
    const stopped = feed(gate, -70, 0.5);

    const levels = (run: Run): { db: number; threshold: number }[] =>
      run.messages.filter((m) => (m as { type?: string }).type === "level") as {
        db: number;
        threshold: number;
      }[];
    expect(levels(silent)).toEqual([]);
    expect(levels(metered).length).toBeGreaterThanOrEqual(18);
    expect(levels(metered).length).toBeLessThanOrEqual(21);
    expect(levels(metered)[0]?.db).toBeCloseTo(-70, 0);
    expect(levels(stopped)).toEqual([]);
  });

  it("ignores malformed messages", () => {
    const gate = new Gate({ processorOptions: { mode: "gate" } });

    send(gate, null);
    send(gate, { type: "configure", mode: "loud", threshold: "x" });
    const quiet = feed(gate, -70, 1);

    expect(peak(quiet.outputs)).toBe(0);
  });
});
