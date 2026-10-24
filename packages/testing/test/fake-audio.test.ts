import { describe, expect, it, vi } from "vitest";
import {
  createFakeAudioGraph,
  createFakeCaptureContext,
} from "../src/media/fake-audio.ts";
import { createFakeMediaEnv } from "../src/media/fake-media-env.ts";
import { createFakeTrack } from "../src/service/fake-track.ts";

describe("fake audio graph", () => {
  it("records connections and follows paths through them", () => {
    // Arrange
    const graph = createFakeAudioGraph();
    const [a, b, c] = ["a", "b", "c"].map((label) => graph.node(label)) as [
      AudioNode,
      AudioNode,
      AudioNode,
    ];

    // Act
    a.connect(b);
    b.connect(c);
    b.connect(c);

    // Assert
    expect(graph.edges()).toEqual(["a->b", "b->c"]);
    expect(graph.reaches(a, c)).toBe(true);
    expect(graph.reaches(c, a)).toBe(false);
    expect(graph.labelOf(b)).toBe("b");
  });

  it("disconnects one destination or all of them, and logs both ways", () => {
    const graph = createFakeAudioGraph();
    const [a, b, c] = ["a", "b", "c"].map((label) => graph.node(label)) as [
      AudioNode,
      AudioNode,
      AudioNode,
    ];
    a.connect(b);
    a.connect(c);

    a.disconnect(b);
    const afterOne = graph.edges();
    a.disconnect();

    expect(afterOne).toEqual(["a->c"]);
    expect(graph.edges()).toEqual([]);
    expect(graph.log).toEqual(["+a->b", "+a->c", "-a->b", "-a->c"]);
  });

  it("labels nodes it did not make as unknown", () => {
    const graph = createFakeAudioGraph();

    expect(graph.labelOf({} as AudioNode)).toBe("?");
  });
});

describe("fake capture context", () => {
  it("makes labelled sources and gates that report and fail on demand", async () => {
    const context = createFakeCaptureContext();
    const transitions = vi.fn();
    const errors = vi.fn();

    const source = context.createSource(createFakeTrack("audio", "mic"));
    const gate = await context.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });
    const offTransition = gate.onTransition(transitions);
    const offError = gate.onError(errors);
    gate.configure({ mode: "detect", auto: false, threshold: -40 });
    gate.emit(true);
    gate.fail(new Error("boom"));
    offTransition();
    offError();
    gate.emit(false);
    source.connect(gate.node);
    gate.dispose();

    expect(context.graph.labelOf(source)).toBe("source:mic");
    expect(context.sources.map((s) => s.node)).toEqual([source]);
    expect(context.gates).toEqual([gate]);
    expect(gate.configs.map((c) => c.mode)).toEqual(["gate", "detect"]);
    expect(transitions.mock.calls).toEqual([[true]]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(gate.disposed).toBe(true);
    expect(context.graph.edges()).toEqual(["source:mic->gate"]);
  });

  it("rejects gates while told to", async () => {
    const context = createFakeCaptureContext();
    const error = new Error("no worklet");

    context.failGates(error);
    const failed = context.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });

    await expect(failed).rejects.toBe(error);
    context.failGates(null);
    await expect(
      context.createGate({ mode: "gate", auto: true, threshold: -50 }),
    ).resolves.toBeDefined();
  });

  it("runs once resumed unless autoplay is blocked, and reports changes", async () => {
    const context = createFakeCaptureContext();
    const changes = vi.fn();
    const off = context.onRunningChange(changes);

    context.blockAutoplay(true);
    await context.resume();
    const blocked = context.running;
    context.blockAutoplay(false);
    await context.resume();
    await context.resume();
    await context.suspend();
    off();
    await context.resume();

    expect(blocked).toBe(false);
    expect(changes.mock.calls).toEqual([[true], [false]]);
    expect(context.running).toBe(true);
  });

  it("gives effects a context whose gain nodes join the same graph", () => {
    const context = createFakeCaptureContext();

    const gain = context.audioContext.createGain();
    gain.connect(context.destination);

    expect(context.audioContext.sampleRate).toBe(48_000);
    expect(context.graph.edges()).toEqual(["gain->destination"]);
    expect(context.output.kind).toBe("audio");
  });

  it("is created by the fake media environment, which keeps each one", async () => {
    const env = createFakeMediaEnv();

    const context = await env.createCaptureContext();

    expect(env.captureContexts).toEqual([context]);
  });
});
