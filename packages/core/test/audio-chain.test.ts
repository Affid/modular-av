import type { AudioStage } from "@modular-av/api";
import {
  createFakeCaptureContext,
  createFakeTrack,
  type FakeCaptureContext,
} from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import {
  type ChainEffect,
  createAudioChain,
  orderByStage,
} from "../src/media/audio-chain.ts";

function effect(
  capture: FakeCaptureContext,
  id: string,
  stage: AudioStage = "denoise",
): ChainEffect {
  const input = capture.graph.node(`${id}.in`);
  const output = capture.graph.node(`${id}.out`);
  input.connect(output);
  return { id, stage, input, output };
}

describe("audio chain", () => {
  it("wires source, effects and gate to the destination in order", async () => {
    // Arrange
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    const gate = await capture.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });

    // Act
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setEffects([effect(capture, "rnnoise")]);
    chain.setGate(gate.node);

    // Assert
    expect(capture.graph.edges()).toEqual([
      "rnnoise.in->rnnoise.out",
      "source:mic->rnnoise.in",
      "rnnoise.out->gate",
      "gate->destination",
    ]);
  });

  it("sends nothing without a source", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    chain.setSource(null);

    expect(capture.graph.edges()).toEqual([]);
  });

  it("goes straight to the destination with no effect and no gate", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    chain.setSource(createFakeTrack("audio", "mic"));

    expect(capture.graph.edges()).toEqual(["source:mic->destination"]);
  });

  it("swaps effects connecting the new path before cutting the old one", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    const mic = createFakeTrack("audio", "mic");
    chain.setSource(mic);
    chain.setEffects([effect(capture, "a")]);
    const source = capture.sources[0]?.node;
    if (!source) throw new Error("no source");
    const before = capture.graph.log.length;

    chain.setEffects([effect(capture, "b")]);

    // Every step of the swap: the source reaches the destination only
    // through a or b, never directly.
    const steps = capture.graph.log.slice(before);
    expect(steps).toEqual([
      "+b.in->b.out",
      "+source:mic->b.in",
      "+b.out->destination",
      "-source:mic->a.in",
      "-a.out->destination",
    ]);
    expect(capture.graph.edges()).not.toContain("source:mic->destination");
    expect(capture.graph.reaches(source, capture.destination)).toBe(true);
  });

  it("changes the device atomically: the new source joins before the old leaves", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    chain.setSource(createFakeTrack("audio", "usb"));
    const before = capture.graph.log.length;

    chain.setSource(createFakeTrack("audio", "headset"));

    expect(capture.graph.log.slice(before)).toEqual([
      "+source:headset->destination",
      "-source:usb->destination",
    ]);
  });

  it("keeps the gate last when effects come and go", async () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    const gate = await capture.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setGate(gate.node);

    chain.setEffects([effect(capture, "a")]);
    chain.setEffects([]);

    // a.in->a.out is the effect's own wiring.
    expect(capture.graph.edges()).toEqual([
      "gate->destination",
      "a.in->a.out",
      "source:mic->gate",
    ]);
  });

  it("disconnects everything it made once disposed", async () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    const gate = await capture.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setEffects([effect(capture, "a")]);
    chain.setGate(gate.node);

    chain.dispose();

    expect(capture.graph.edges()).toEqual(["a.in->a.out"]);
  });

  it("orders effects by stage, keeping the given order within a stage", () => {
    const capture = createFakeCaptureContext();

    const ordered = orderByStage([
      effect(capture, "reverb", "post"),
      effect(capture, "pitch", "voice"),
      effect(capture, "rnnoise", "denoise"),
      effect(capture, "eq", "post"),
    ]);

    expect(ordered.map((e) => e.id)).toEqual([
      "rnnoise",
      "pitch",
      "reverb",
      "eq",
    ]);
  });
});
