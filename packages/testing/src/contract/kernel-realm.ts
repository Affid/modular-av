import vm from "node:vm";
import { notPlainData } from "./plain-data.ts";

/**
 * Runs an audio kernel where a processing server would: with ECMAScript's
 * built-ins (V8 adds `console` and `WebAssembly`) and
 * `modularAV.registerAudioKernel`, and nothing of the worklet around it
 * (`sampleRate`, `currentTime`, `currentFrame`, `port`, `registerProcessor`).
 * A kernel that keeps to its constructor's arguments and `configure`, and is
 * sent only plain data, can then run on either side.
 */
export class PortabilityError extends Error {
  override readonly name = "PortabilityError";
}

export interface AudioKernel {
  render(input: Float32Array, output: Float32Array): void;
  configure?(value: unknown): void;
}

export type AudioKernelClass = new (init: {
  readonly sampleRate: number;
  readonly options: unknown;
}) => AudioKernel;

export interface KernelRun {
  /** What the module passes as the kernel's `options`. */
  readonly options?: unknown;
  /** Values the module sends to `configure`, in turn, while sound plays. */
  readonly configure?: readonly unknown[];
}

/** The core's capture rate. */
const SAMPLE_RATE = 48_000;
const BLOCK = 128;
const TONE_HZ = 440;
const TONE_LEVEL = 0.5;
/** Half a second of tone, the settings, half a second more, then a second of silence. */
const TONE_BLOCKS = Math.round((0.5 * SAMPLE_RATE) / BLOCK);
const SILENT_BLOCKS = Math.round(SAMPLE_RATE / BLOCK);

/** A realm's own errors aren't `instanceof Error` here. */
const messageOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);

function assertPlain(value: unknown, path: string): void {
  const found = notPlainData(value, path);
  if (found) {
    throw new PortabilityError(
      `${found}: a kernel is sent only plain data and raw bytes`,
    );
  }
}

function attempt<T>(what: string, action: () => T): T {
  try {
    return action();
  } catch (error: unknown) {
    throw new PortabilityError(
      `The kernel fails outside a worklet as it ${what}: ${messageOf(error)}`,
      { cause: error },
    );
  }
}

export function loadKernel(
  source: string,
  filename: string,
  name: string,
): AudioKernelClass {
  const kernels = new Map<string, unknown>();
  const registerAudioKernel = (kernelName: string, Kernel: unknown): void => {
    kernels.set(kernelName, Kernel);
  };
  const realm = vm.createContext({
    modularAV: Object.freeze({ registerAudioKernel }),
  });
  try {
    vm.runInContext(source, realm, { filename });
  } catch (error: unknown) {
    throw new PortabilityError(
      `${filename} doesn't load outside a worklet: ${messageOf(error)}`,
      { cause: error },
    );
  }
  const Kernel = kernels.get(name);
  if (typeof Kernel !== "function") {
    throw new PortabilityError(`${filename} registers no kernel "${name}"`);
  }
  return Kernel as AudioKernelClass;
}

function renderBlocks(
  kernel: AudioKernel,
  from: number,
  count: number,
  level: number,
): void {
  const input = new Float32Array(BLOCK);
  const output = new Float32Array(BLOCK);
  for (let block = from; block < from + count; block += 1) {
    for (let i = 0; i < BLOCK; i += 1) {
      const frame = block * BLOCK + i;
      input[i] =
        level * Math.sin((2 * Math.PI * TONE_HZ * frame) / SAMPLE_RATE);
    }
    attempt("renders", () => {
      kernel.render(input, output);
    });
    const bad = output.findIndex((sample) => !Number.isFinite(sample));
    if (bad >= 0) {
      throw new PortabilityError(
        `The kernel's output is not a number at frame ${block * BLOCK + bad}`,
      );
    }
  }
}

/** Builds the kernel, renders, sends each setting mid-sound, renders on. */
export function exerciseKernel(
  Kernel: AudioKernelClass,
  { options, configure = [] }: KernelRun,
): void {
  assertPlain(options, "options");
  configure.forEach((value, index) => {
    assertPlain(value, `configure[${index}]`);
  });
  const kernel = attempt(
    "is built",
    () => new Kernel({ sampleRate: SAMPLE_RATE, options }),
  );
  if (configure.length > 0 && typeof kernel.configure !== "function") {
    throw new PortabilityError(
      "The kernel is sent settings but has no configure",
    );
  }
  renderBlocks(kernel, 0, TONE_BLOCKS, TONE_LEVEL);
  for (const value of configure) {
    attempt("is configured", () => kernel.configure?.(value));
  }
  renderBlocks(kernel, TONE_BLOCKS, TONE_BLOCKS, TONE_LEVEL);
  renderBlocks(kernel, 2 * TONE_BLOCKS, SILENT_BLOCKS, 0);
}
