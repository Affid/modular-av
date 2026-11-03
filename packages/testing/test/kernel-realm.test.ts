import { describe, expect, it } from "vitest";
import {
  exerciseKernel,
  loadKernel,
  PortabilityError,
} from "../src/contract/kernel-realm.ts";

const FILE = "worklets/test.js";
const NAME = "test-kernel";

const kernelFile = (body: string, prelude = ""): string => `${prelude}
modularAV.registerAudioKernel("${NAME}", class {
  constructor({ sampleRate, options }) {
    this.rate = sampleRate;
    this.gain = options?.gain ?? 1;
  }
  ${body}
});`;

const portableBody = `
  render(input, output) {
    for (let i = 0; i < input.length; i += 1) output[i] = input[i] * this.gain;
  }
  configure(value) { this.gain = value.gain; }
`;
const portable = kernelFile(portableBody);

describe("loading a kernel outside a worklet", () => {
  it("finds a kernel that uses only what it is given", () => {
    // Act
    const Kernel = loadKernel(portable, FILE, NAME);

    // Assert
    const kernel = new Kernel({ sampleRate: 48_000, options: { gain: 0.5 } });
    const output = new Float32Array(2);
    kernel.render(new Float32Array([1, -1]), output);
    expect([...output]).toEqual([0.5, -0.5]);
  });

  it.each([
    ["the worklet's sample rate", "const RATE = sampleRate;", "sampleRate"],
    [
      "the worklet's processor class",
      "class P extends AudioWorkletProcessor {}",
      "AudioWorkletProcessor",
    ],
    ["Node's process", "const env = process.env;", "process"],
    ["the network", "fetch('https://example.com');", "fetch"],
  ])(
    "refuses a file that reaches for %s as it loads",
    (_what, prelude, name) => {
      // Arrange
      const source = kernelFile(portableBody, prelude);

      // Act
      const load = () => loadKernel(source, FILE, NAME);

      // Assert
      expect(load).toThrow(PortabilityError);
      expect(load).toThrow(name);
    },
  );

  it("says so when the file registers no kernel by that name", () => {
    const load = () => loadKernel(portable, FILE, "another-kernel");

    expect(load).toThrow(PortabilityError);
    expect(load).toThrow(/another-kernel/);
  });

  it("names the file a syntax error is in", () => {
    const load = () => loadKernel("modularAV.registerAudioKernel(", FILE, NAME);

    expect(load).toThrow(FILE);
  });
});

describe("exercising a kernel outside a worklet", () => {
  it("passes a kernel that renders and takes its settings", () => {
    // Arrange
    const Kernel = loadKernel(portable, FILE, NAME);

    // Act
    const run = () => {
      exerciseKernel(Kernel, {
        options: { gain: 0.5 },
        configure: [{ gain: 0.25 }],
      });
    };

    // Assert
    expect(run).not.toThrow();
  });

  it.each([
    [
      "the render time",
      "render(input, output) { output[0] = currentTime; }",
      "currentTime",
    ],
    [
      "the render frame",
      "render(input, output) { output[0] = currentFrame; }",
      "currentFrame",
    ],
    [
      "the clock",
      "render(input, output) { output[0] = performance.now(); }",
      "performance",
    ],
  ])("fails a kernel that reads %s while it renders", (_what, body, name) => {
    // Arrange
    const Kernel = loadKernel(kernelFile(body), FILE, NAME);

    // Act
    const run = () => {
      exerciseKernel(Kernel, {});
    };

    // Assert
    expect(run).toThrow(PortabilityError);
    expect(run).toThrow(name);
  });

  it("fails a kernel that reaches outside as it is configured", () => {
    // Arrange
    const source = kernelFile(`
      render(input, output) { output.set(input); }
      configure(value) { this.port.postMessage(value); }
    `);
    const Kernel = loadKernel(source, FILE, NAME);

    // Act
    const run = () => {
      exerciseKernel(Kernel, { configure: [{ gain: 1 }] });
    };

    // Assert
    expect(run).toThrow(PortabilityError);
    expect(run).toThrow(/configure/);
  });

  it("fails a kernel that is sent settings but takes none", () => {
    const source = kernelFile("render(input, output) { output.set(input); }");
    const Kernel = loadKernel(source, FILE, NAME);

    const run = () => {
      exerciseKernel(Kernel, { configure: [{ gain: 1 }] });
    };

    expect(run).toThrow(/no configure/);
  });

  it("fails a kernel whose output isn't a number", () => {
    // Arrange: fine on silence, broken once sound comes in.
    const source = kernelFile(
      "render(input, output) { output.fill(input[0] ? Number.NaN : 0); }",
    );
    const Kernel = loadKernel(source, FILE, NAME);

    // Act
    const run = () => {
      exerciseKernel(Kernel, {});
    };

    // Assert
    expect(run).toThrow(/not a number/);
  });
});
