import type { AudioPlace } from "@modular-av/api";
import {
  createFakeCaptureContext,
  createFakeTrack,
  type FakeCaptureContext,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChainEffect,
  createAudioChain,
  orderByPlace,
} from "../src/media/audio-chain.ts";
import { GATE_FEED_OUTPUT, GATE_SEND_OUTPUT } from "../src/media/env.ts";

function effect(
  capture: FakeCaptureContext,
  id: string,
  place: AudioPlace = "pre-gate",
): ChainEffect {
  const input = capture.graph.node(`${id}.in`);
  const output = capture.graph.node(`${id}.out`);
  input.connect(output);
  return { id, place, input, output };
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
        "mute->post feed",
        "post feed->channel",
        "channel->destination",
      ]),
    );
  });

  it("runs pre-gate effects before the gate, post-gate effects after it and after mute", async () => {
    // Arrange
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    const gate = await capture.createGate({
      mode: "gate",
      auto: true,
      threshold: -50,
    });
    const denoise = effect(capture, "rnnoise", "pre-gate");
    const voice = effect(capture, "pitch", "pre-gate");
    const post = effect(capture, "radio", "post-gate");

    // Act
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setGate(gate.node);
    chain.setEffects(orderByPlace([post, denoise, voice]));

    // Assert
    const { graph, destination, sources } = capture;
    const source = sources[0]?.node;
    const mute = capture.level("mute")?.node;
    if (!source || !mute) throw new Error("no source or mute");
    expect(graph.feeds(source, denoise.input)).toBe(true);
    expect(graph.feeds(denoise.output, voice.input)).toBe(true);
    expect(graph.feeds(voice.output, gate.node)).toBe(true);
    expect(graph.feeds(gate.node, mute)).toBe(true);
    expect(graph.reaches(mute, post.input)).toBe(true);
    expect(graph.reaches(post.output, destination)).toBe(true);
    expect(graph.reaches(post.input, gate.node)).toBe(false);
  });

  it("keeps post effects after mute with no gate running", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setEffects([effect(capture, "radio", "post-gate")]);

    expect(new Set(capture.graph.edges())).toEqual(
      new Set([
        "radio.in->radio.out",
        "source:mic->mute",
        "mute->post feed",
        "post feed->radio.in",
        "radio.out->channel",
        "channel->destination",
      ]),
    );
  });

  it("connects the new path first when the gate joins ahead of post effects", async () => {
    // Arrange
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);
    chain.setSource(createFakeTrack("audio", "mic"));
    chain.setEffects([effect(capture, "radio", "post-gate")]);
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

  it("starts muted, fails closed, and moves within 5 ms so it doesn't click", () => {
    const capture = createFakeCaptureContext();
    const chain = createAudioChain(capture);

    expect(capture.level("mute")?.level).toBe(0);

    chain.setOpen(true);
    expect(capture.level("mute")?.level).toBe(1);
    expect(capture.level("mute")?.rampMs).toBe(5);

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
      "mute->post feed",
      "post feed->channel",
      "channel->destination",
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
        "mute->post feed",
        "post feed->channel",
        "channel->destination",
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

  describe("dry:wet on an insert", () => {
    function chained(latency: number | null = 0.01) {
      const capture = createFakeCaptureContext();
      const chain = createAudioChain(capture);
      const radio = {
        ...effect(capture, "radio", "post-gate"),
        ...(latency === null ? {} : { latency }),
      };
      chain.setSource(createFakeTrack("audio", "mic"));
      chain.setEffects([radio]);
      return { capture, chain, radio };
    }

    it("stays a plain link at 100% wet: no dry branch, no extra node", () => {
      const { capture, radio } = chained();

      expect(capture.level("wet:radio")).toBeUndefined();
      const feed = capture.level("post feed")?.node;
      if (!feed) throw new Error("no feed");
      expect(capture.graph.feeds(feed, radio.input)).toBe(true);
    });

    it("mixes the effect with a dry signal delayed by its latency", () => {
      // Arrange
      const { capture, chain, radio } = chained(0.01);

      // Act
      chain.setMix("radio", 0.3);

      // Assert
      const { graph } = capture;
      const dry = capture.level("dry:radio");
      const wet = capture.level("wet:radio");
      const delay = capture.delay("dry delay:radio");
      const feed = capture.level("post feed")?.node;
      const channel = capture.level("channel")?.node;
      if (!dry || !wet || !delay || !feed || !channel)
        throw new Error("slot missing");
      expect(dry.level).toBeCloseTo(0.7);
      expect(wet.level).toBeCloseTo(0.3);
      expect(delay.seconds).toBe(0.01);
      expect(graph.reaches(feed, delay.node)).toBe(true);
      expect(graph.reaches(delay.node, dry.node)).toBe(true);
      expect(graph.reaches(dry.node, channel)).toBe(true);
      expect(graph.feeds(radio.output, wet.node)).toBe(true);
      expect(graph.reaches(wet.node, channel)).toBe(true);
      expect(graph.feeds(radio.output, channel)).toBe(false);
    });

    it("needs no delay for an effect without latency", () => {
      const { capture, chain } = chained(0);

      chain.setMix("radio", 0.5);

      expect(capture.delay("dry delay:radio")).toBeUndefined();
      const dry = capture.level("dry:radio");
      if (!dry) throw new Error("no dry level");
      expect(capture.graph.reaches(dry.node, capture.destination)).toBe(true);
    });

    it("moves the mix with a short fade, once the branch exists", () => {
      const { capture, chain } = chained();
      chain.setMix("radio", 0.5);

      chain.setMix("radio", 0.2);

      expect(capture.level("wet:radio")?.level).toBeCloseTo(0.2);
      expect(capture.level("wet:radio")?.rampMs).toBe(20);
      expect(capture.level("dry:radio")?.level).toBeCloseTo(0.8);
    });

    it("joins at the plain link's level, and fades from there", () => {
      const { capture, chain } = chained();

      chain.setMix("radio", 0.5);

      expect(capture.level("wet:radio")?.levels).toEqual([1, 0.5]);
      expect(capture.level("dry:radio")?.levels).toEqual([0, 0.5]);
    });

    it("connects the dry branch before cutting the plain link, and back after its fade", () => {
      // Arrange
      vi.useFakeTimers();
      const { capture, chain, radio } = chained();
      const before = capture.graph.log.length;

      // Act
      chain.setMix("radio", 0.5);
      const added = capture.graph.log.slice(before);
      const reverted = capture.graph.log.length;
      chain.setMix("radio", 1);
      const fading = capture.graph.log.length;
      const wet = capture.level("wet:radio")?.level;
      vi.advanceTimersByTime(20);
      vi.useRealTimers();

      // Assert
      expect(fading).toBe(reverted);
      expect(wet).toBe(1);
      const cut = "-post feed->radio.in";
      expect(added.indexOf(cut)).toBeGreaterThan(
        added.indexOf("+post feed->insert:radio"),
      );
      const back = capture.graph.log.slice(reverted);
      expect(back.indexOf("+post feed->radio.in")).toBeLessThan(
        back.indexOf("-post feed->insert:radio"),
      );
      const feed = capture.level("post feed")?.node;
      if (!feed) throw new Error("no feed");
      expect(capture.graph.feeds(feed, radio.input)).toBe(true);
      expect(capture.level("dry:radio")?.disposed).toBe(true);
    });

    it("keeps the branch if the mix moves again during that fade", () => {
      vi.useFakeTimers();
      const { capture, chain } = chained();
      chain.setMix("radio", 0.5);

      chain.setMix("radio", 1);
      vi.advanceTimersByTime(10);
      chain.setMix("radio", 0.7);
      vi.advanceTimersByTime(50);
      vi.useRealTimers();

      expect(capture.level("dry:radio")?.disposed).toBe(false);
      expect(capture.level("wet:radio")?.level).toBeCloseTo(0.7);
    });

    it("does nothing for a mix that didn't change", () => {
      const { capture, chain } = chained();
      chain.setMix("radio", 0.5);
      const wet = capture.level("wet:radio");
      const moves = wet?.levels.length;

      chain.setMix("radio", 0.5);

      expect(wet?.levels.length).toBe(moves);
    });

    it("keeps an effect that didn't declare its latency at 100% wet", () => {
      const { capture, chain } = chained(null);

      chain.setMix("radio", 0.5);

      expect(capture.level("dry:radio")).toBeUndefined();
    });

    it("applies a mix set before the effect runs, and works before the gate too", () => {
      const capture = createFakeCaptureContext();
      const chain = createAudioChain(capture);
      chain.setSource(createFakeTrack("audio", "mic"));
      chain.setMix("pitch", 0.4);

      chain.setEffects([
        { ...effect(capture, "pitch", "pre-gate"), latency: 0.02 },
      ]);

      expect(capture.level("wet:pitch")?.level).toBeCloseTo(0.4);
      expect(capture.delay("dry delay:pitch")?.seconds).toBe(0.02);
    });

    it("takes the branch away with the effect", () => {
      const { capture, chain } = chained();
      chain.setMix("radio", 0.5);

      chain.setEffects([]);

      expect(capture.level("dry:radio")?.disposed).toBe(true);
      expect(capture.delay("dry delay:radio")?.disposed).toBe(true);
    });
  });

  describe("sends", () => {
    async function gated(capture: FakeCaptureContext) {
      const chain = createAudioChain(capture);
      const gate = await capture.createGate({
        mode: "gate",
        auto: true,
        threshold: -50,
      });
      chain.setSource(createFakeTrack("audio", "mic"));
      chain.setGate(gate.node);
      return { chain, gate };
    }

    it("takes a copy after the post effects, before Channel level, and returns it to the destination", async () => {
      // Arrange
      const capture = createFakeCaptureContext();
      const { chain } = await gated(capture);
      const post = effect(capture, "radio", "post-gate");
      const reverb = effect(capture, "reverb", "send");

      // Act
      chain.setEffects([post, reverb]);

      // Assert
      const channel = capture.level("channel")?.node;
      const send = capture.level("send")?.node;
      const back = capture.level("return:reverb")?.node;
      if (!channel || !send || !back) throw new Error("levels missing");
      const { graph, destination } = capture;
      expect(graph.feeds(post.output, channel)).toBe(true);
      expect(graph.feeds(post.output, send)).toBe(true);
      expect(graph.feeds(channel, destination)).toBe(true);
      expect(graph.feeds(send, reverb.input)).toBe(true);
      expect(graph.feeds(reverb.output, back)).toBe(true);
      expect(graph.feeds(back, destination)).toBe(true);
      expect(graph.reaches(post.output, reverb.input)).toBe(true);
      expect(graph.reaches(reverb.output, channel)).toBe(false);
    });

    it("gives each send effect an FX channel of its own, side by side", async () => {
      const capture = createFakeCaptureContext();
      const { chain } = await gated(capture);
      const reverb = effect(capture, "reverb", "send");
      const delay = effect(capture, "delay", "send");

      chain.setEffects([reverb, delay]);

      const { graph } = capture;
      const send = capture.level("send")?.node;
      if (!send) throw new Error("no send");
      expect(graph.feeds(send, reverb.input)).toBe(true);
      expect(graph.feeds(send, delay.input)).toBe(true);
      expect(graph.reaches(reverb.output, delay.input)).toBe(false);
      expect(graph.reaches(delay.output, reverb.input)).toBe(false);
    });

    it("drops the send path with the last send effect", async () => {
      const capture = createFakeCaptureContext();
      const { chain } = await gated(capture);
      chain.setEffects([effect(capture, "reverb", "send")]);

      chain.setEffects([]);

      const send = capture.level("send")?.node;
      if (!send) throw new Error("no send");
      expect(
        capture.graph.reaches(capture.sources[0]?.node ?? send, send),
      ).toBe(false);
      expect(capture.level("return:reverb")?.disposed).toBe(true);
    });

    it("follows the gate on the audio thread, and opens when no gate runs", async () => {
      // Arrange
      const capture = createFakeCaptureContext();
      const { chain, gate } = await gated(capture);

      // Assert
      expect(capture.level("post feed")?.following).toEqual({
        node: gate.node,
        output: GATE_FEED_OUTPUT,
      });
      expect(capture.level("send")?.following).toEqual({
        node: gate.node,
        output: GATE_SEND_OUTPUT,
      });

      // Act
      chain.setGate(null);

      // Assert
      expect(capture.level("post feed")?.following).toBeNull();
      expect(capture.level("send")?.following).toBeNull();
      expect(capture.level("post feed")?.level).toBe(1);
      expect(capture.level("send")?.level).toBe(1);
    });

    it("without k-rate gains, keeps the post feed open and moves the sends by message", async () => {
      // Arrange
      const capture = createFakeCaptureContext({ canFollow: false });
      const { chain } = await gated(capture);
      const send = capture.level("send");

      // Assert
      expect(capture.level("post feed")?.following).toBeNull();
      expect(capture.level("post feed")?.level).toBe(1);
      expect(send?.following).toBeNull();
      expect(send?.level).toBe(0);

      // Act
      chain.setSpeaking(true);
      const open = { level: send?.level, ramp: send?.rampMs };
      chain.setSpeaking(false);
      const closed = { level: send?.level, ramp: send?.rampMs };
      chain.setSpeaking(true);
      chain.setGate(null);

      // Assert
      expect(open).toEqual({ level: 1, ramp: 5 });
      expect(closed).toEqual({ level: 0, ramp: 50 });
      expect(send?.level).toBe(1);
    });

    it("sets Channel level and Return levels with a short fade", async () => {
      const capture = createFakeCaptureContext();
      const { chain } = await gated(capture);
      chain.setEffects([effect(capture, "reverb", "send")]);

      chain.setChannelLevel(0.4);
      chain.setMix("reverb", 0.3);

      expect(capture.level("channel")?.level).toBe(0.4);
      expect(capture.level("channel")?.rampMs).toBe(20);
      expect(capture.level("return:reverb")?.level).toBe(0.3);
      expect(capture.level("return:reverb")?.rampMs).toBe(20);
    });

    it("keeps a Return level set before the effect runs", async () => {
      const capture = createFakeCaptureContext();
      const { chain } = await gated(capture);

      chain.setMix("reverb", 0.25);
      chain.setEffects([effect(capture, "reverb", "send")]);

      expect(capture.level("return:reverb")?.level).toBe(0.25);
    });

    it("treats Channel level as full while nothing else could carry the voice", async () => {
      // Arrange
      const capture = createFakeCaptureContext();
      const { chain } = await gated(capture);
      const channel = capture.level("channel");
      chain.setChannelLevel(0);

      // No FX channel: the player must still be heard.
      expect(channel?.level).toBe(1);

      // A live FX channel with a Return above 0 carries the voice.
      const reverb = effect(capture, "reverb", "send");
      chain.setEffects([reverb]);
      expect(channel?.level).toBe(0);

      // A Return at 0 doesn't.
      chain.setMix("reverb", 0);
      expect(channel?.level).toBe(1);
      chain.setMix("reverb", 0.5);
      expect(channel?.level).toBe(0);

      // Nor does an effect that left, as a failed one does.
      chain.setEffects([]);
      expect(channel?.level).toBe(1);
    });

    describe("fading out", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it("fades the Return, then cuts the FX channel and tells the caller", async () => {
        // Arrange
        const capture = createFakeCaptureContext();
        const { chain } = await gated(capture);
        const reverb = effect(capture, "reverb", "send");
        chain.setEffects([reverb]);
        const back = capture.level("return:reverb");
        const send = capture.level("send")?.node;
        if (!back || !send) throw new Error("levels missing");
        const gone = vi.fn();

        // Act
        void chain.fade("reverb")?.then(gone);
        chain.setEffects([]);

        // Assert: nothing new goes in, what rings still comes out.
        expect(capture.graph.feeds(send, reverb.input)).toBe(false);
        expect(capture.graph.feeds(reverb.output, back.node)).toBe(true);
        expect(back.level).toBe(0);
        expect(back.rampMs).toBe(50);
        expect(gone).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(50);

        expect(capture.graph.feeds(reverb.output, back.node)).toBe(false);
        expect(back.disposed).toBe(true);
        expect(gone).toHaveBeenCalledOnce();
      });

      it("lets a second fade of the same effect finish on its own", async () => {
        // Arrange: off, on and off again, faster than a fade.
        const capture = createFakeCaptureContext();
        const { chain } = await gated(capture);
        const first = effect(capture, "reverb", "send");
        chain.setEffects([first]);
        const firstBack = capture.level("return:reverb");
        void chain.fade("reverb");
        chain.setEffects([]);
        await vi.advanceTimersByTimeAsync(30);
        const second = effect(capture, "reverb", "send");
        chain.setEffects([second]);
        const secondBack = capture.level("return:reverb");
        void chain.fade("reverb");
        chain.setEffects([]);
        if (!firstBack || !secondBack) throw new Error("levels missing");

        // Act: the first fade ends while the second still runs.
        await vi.advanceTimersByTimeAsync(20);

        // Assert
        expect(firstBack.disposed).toBe(true);
        expect(capture.graph.feeds(second.output, secondBack.node)).toBe(true);

        await vi.advanceTimersByTimeAsync(30);
        expect(capture.graph.feeds(second.output, secondBack.node)).toBe(false);
      });

      it("has nothing to fade for an insert", async () => {
        const capture = createFakeCaptureContext();
        const { chain } = await gated(capture);
        chain.setEffects([effect(capture, "radio", "post-gate")]);

        expect(chain.fade("radio")).toBeNull();
      });

      it("finishes a fade at once when disposed", async () => {
        const capture = createFakeCaptureContext();
        const { chain } = await gated(capture);
        chain.setEffects([effect(capture, "reverb", "send")]);
        const gone = vi.fn();
        void chain.fade("reverb")?.then(gone);
        chain.setEffects([]);

        chain.dispose();
        await vi.advanceTimersByTimeAsync(0);

        expect(gone).toHaveBeenCalledOnce();
      });
    });
  });

  it("orders effects by place, keeping the given order within a place", () => {
    const capture = createFakeCaptureContext();

    const ordered = orderByPlace([
      effect(capture, "echo", "send"),
      effect(capture, "reverb", "post-gate"),
      effect(capture, "rnnoise", "pre-gate"),
      effect(capture, "pitch", "pre-gate"),
      effect(capture, "eq", "post-gate"),
    ]);

    expect(ordered.map((e) => e.id)).toEqual([
      "rnnoise",
      "pitch",
      "reverb",
      "eq",
      "echo",
    ]);
  });

  it("puts what must come first ahead of its place", () => {
    const capture = createFakeCaptureContext();

    const ordered = orderByPlace(
      [
        effect(capture, "pitch", "pre-gate"),
        effect(capture, "rnnoise", "pre-gate"),
      ],
      (id) => id === "rnnoise",
    );

    expect(ordered.map((e) => e.id)).toEqual(["rnnoise", "pitch"]);
  });
});
