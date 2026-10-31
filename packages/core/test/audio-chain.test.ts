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
  it("wires source, pre-gate effects, gate and mute to the destination", async () => {
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
    expect(new Set(capture.graph.edges())).toEqual(
      new Set([
        "rnnoise.in->rnnoise.out",
        "source:mic->rnnoise.in",
        "rnnoise.out->gate",
        "gate->mute",
        "mute->destination",
      ]),
    );
  });

  it("runs denoise and voice effects before the gate, post effects after it and after mute", async () => {
    // Arrange
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    const gate = await capture.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });
    const denoise = effect(capture, "rnnoise", "denoise");
    const voice = effect(capture, "pitch", "voice");
    const post = effect(capture, "radio", "post");

    // Act
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setGate(gate.node);
    chain.setEffects(orderByStage([post, voice, denoise]));

    // Assert
    const { graph, destination, sources } = capture;
    const source = sources[0]?.node;
    const mute = capture.level("mute")?.node;
    if (!source || !mute) throw new Error("no source or mute");
    expect(graph.feeds(source, denoise.input)).toBe(true);
    expect(graph.feeds(denoise.output, voice.input)).toBe(true);
    expect(graph.feeds(voice.output, gate.node)).toBe(true);
    expect(graph.feeds(gate.node, mute)).toBe(true);
    expect(graph.feeds(mute, post.input)).toBe(true);
    expect(graph.feeds(post.output, destination)).toBe(true);
  });

  it("keeps post effects after mute with no gate running", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setEffects([effect(capture, "radio", "post")]);

    expect(new Set(capture.graph.edges())).toEqual(
      new Set([
        "radio.in->radio.out",
        "source:mic->mute",
        "mute->radio.in",
        "radio.out->destination",
      ]),
    );
  });

  it("connects the new path first when the gate joins ahead of post effects", async () => {
    // Arrange
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setEffects([effect(capture, "radio", "post")]);
    const gate = await capture.createGate({
      mode: "detect",
      auto: true,
      threshold: -50,
    });
    const before = capture.graph.log.length;

    // Act
    chain.setGate(gate.node);

    // Assert
    expect(capture.graph.log.slice(before)).toEqual([
      "+source:mic->gate",
      "+gate->mute",
      "-source:mic->mute",
    ]);
  });

  it("starts muted, fails closed, and opens and closes at once", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    expect(capture.level("mute")?.level).toBe(0);

    chain.setOpen(true);
    expect(capture.level("mute")?.level).toBe(1);
    expect(capture.level("mute")?.rampMs).toBe(0);

    chain.setOpen(false);
    expect(capture.level("mute")?.level).toBe(0);
  });

  it("sends nothing without a source", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    chain.setSource(null);

    expect(capture.graph.edges()).toEqual([]);
  });

  it("goes through mute alone with no effect and no gate", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    chain.setSource(createFakeTrack("audio", "mic"));

    expect(capture.graph.edges()).toEqual([
      "source:mic->mute",
      "mute->destination",
    ]);
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
      "+b.out->mute",
      "-source:mic->a.in",
      "-a.out->mute",
    ]);
    expect(capture.graph.edges()).not.toContain("source:mic->mute");
    expect(capture.graph.reaches(source, capture.destination)).toBe(true);
  });

  it("changes the device atomically: the new source joins before the old leaves", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    chain.setSource(createFakeTrack("audio", "usb"));
    const before = capture.graph.log.length;

    chain.setSource(createFakeTrack("audio", "headset"));

    expect(capture.graph.log.slice(before)).toEqual([
      "+source:headset->mute",
      "-source:usb->mute",
    ]);
  });

  it("keeps the gate after pre-gate effects when they come and go", async () => {
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
    expect(new Set(capture.graph.edges())).toEqual(
      new Set([
        "gate->mute",
        "mute->destination",
        "a.in->a.out",
        "source:mic->gate",
      ]),
    );
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
