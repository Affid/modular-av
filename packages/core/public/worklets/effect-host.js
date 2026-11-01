/* global AudioWorkletProcessor, registerProcessor, sampleRate */
/**
 * Runs an effect's kernel, calling `render()` only while there is sound or for
 * the kernel's declared tail after it: an effect that works on silence costs
 * the player all the time.
 *
 * An effect module's worklet file, loaded after this one, adds its kernel:
 *
 *   modularAV.registerKernel("my-reverb", class {
 *     constructor({ sampleRate, options }) {}
 *     render(input, output) {} // two Float32Arrays, mono, one block each
 *     configure(value) {}      // optional: what `configure()` sent
 *   });
 *
 * Processor options: { kernel: string, tail?: number (s), options?: unknown }
 * Messages in: anything, handed to the kernel's `configure`.
 * Messages out: { type: "failed", error: string }, once; silence from then on.
 */

const kernels = new Map();

globalThis.modularAV = {
  registerKernel(name, Kernel) {
    kernels.set(name, Kernel);
  },
};

const hasSound = (samples) => {
  for (const sample of samples) if (sample !== 0) return true;
  return false;
};

const allFinite = (samples) => {
  for (const sample of samples) if (!Number.isFinite(sample)) return false;
  return true;
};

class EffectHostProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const {
      kernel,
      tail = 0,
      options: kernelOptions,
    } = options?.processorOptions ?? {};
    // NaN or Infinity would run the kernel on silence for ever
    this.tailFrames =
      Number.isFinite(tail) && tail > 0 ? Math.ceil(tail * sampleRate) : 0;
    this.framesLeft = 0;
    this.zeros = new Float32Array(0);
    this.kernel = null;
    try {
      const Kernel = kernels.get(kernel);
      if (!Kernel) throw new Error(`No kernel named "${String(kernel)}"`);
      this.kernel = new Kernel({ sampleRate, options: kernelOptions });
    } catch (error) {
      this.fail(error);
    }
    this.port.onmessage = (event) => {
      try {
        this.kernel?.configure?.(event.data);
      } catch (error) {
        this.fail(error);
      }
    };
  }

  fail(error) {
    this.kernel = null;
    this.port.postMessage({ type: "failed", error: String(error) });
  }

  /** Whether `render` has anything to do this block. */
  wanted(input, length) {
    if (input && hasSound(input)) this.framesLeft = this.tailFrames;
    else if (this.framesLeft <= 0) return false;
    else this.framesLeft -= length;
    return true;
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    const input = inputs[0]?.[0];
    if (!this.kernel || !output || !this.wanted(input, output.length))
      return true;
    if (!input && this.zeros.length !== output.length)
      this.zeros = new Float32Array(output.length);
    try {
      this.kernel.render(input ?? this.zeros, output);
      if (!allFinite(output))
        throw new Error("The kernel's output isn't a number");
    } catch (error) {
      output.fill(0);
      this.fail(error);
    }
    return true;
  }
}

registerProcessor("modular-av-effect-host", EffectHostProcessor);
