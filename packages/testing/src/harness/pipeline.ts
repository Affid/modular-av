// Harness additions for the core's media pipeline in a real browser
// (?service=mock&effects=test): the mock service, recording what is
// published, and two small real effects.
import type {
  AudioEffectDefinition,
  ModularAV,
  ServiceDefinition,
  TrackSource,
  VideoEffect,
  VideoEffectDefinition,
} from "@modular-av/api";
import { createMockServiceHub, type MockServiceHub } from "../service/hub.ts";

/** What the published tracks are, by source, as the service was told. */
export type PublishedTracks = Partial<
  Record<TrackSource, { readonly id: string; readonly label: string }>
>;

/** What the published microphone sent while it was recorded. */
export interface AudioRecording {
  /** Linear, 0 to 1. */
  readonly peak: number;
  /** The longest run of exact zeros, in samples: a gap in the chain. */
  readonly longestZeroRun: number;
  readonly samples: number;
}

export interface PipelineControls {
  published(): PublishedTracks;
  /** The track the service was given for `source`, for page code to read. */
  track(source: TrackSource): MediaStreamTrack | null;
  /** Reads what the service was given for `source` for `ms` (Chromium). */
  record(source: TrackSource, ms: number): Promise<AudioRecording>;
  /** Reads the core's voice preview for `ms` (Chromium). */
  recordVoice(ms: number): Promise<AudioRecording>;
  /** The pass-through camera effect stops (or resumes) sending frames. */
  stallVideo(stalled: boolean): void;
}

/** The parts of the insertable streams API (Chromium) used here. */
interface VideoFrameLike {
  close(): void;
}
type Processor = new (init: { track: MediaStreamTrack }) => {
  readonly readable: ReadableStream<VideoFrameLike>;
};
type Generator = new (init: { kind: "video" }) => MediaStreamTrack & {
  readonly writable: WritableStream<VideoFrameLike>;
};
const insertable = globalThis as unknown as {
  MediaStreamTrackProcessor: Processor;
  MediaStreamTrackGenerator: Generator;
};

function recordingService(
  definition: ServiceDefinition,
  published: Map<TrackSource, MediaStreamTrack>,
): ServiceDefinition {
  return {
    ...definition,
    canSignTokens: () => true,
    async create(context) {
      const connection = await definition.create(context);
      return {
        ...connection,
        capabilities: connection.capabilities,
        async publish(track, source) {
          published.set(source, track);
          return connection.publish(track, source);
        },
        async replaceTrack(handle, track) {
          published.set(handle.source, track);
          return connection.replaceTrack(handle, track);
        },
        async unpublish(handle) {
          published.delete(handle.source);
          return connection.unpublish(handle);
        },
      };
    },
  };
}

const gainEffect: AudioEffectDefinition = {
  id: "test-gain",
  kind: "audio",
  label: "Test gain",
  defaultPlace: "post-gate",
  cost: "light",
  isSupported: () => true,
  create({ audioContext }) {
    const node = audioContext.createGain();
    return Promise.resolve({
      input: node,
      output: node,
      dispose: () => {
        node.disconnect();
      },
    });
  },
};

/** Adds a hum of its own, so a recording shows where in the chain it sits. */
const humEffect: AudioEffectDefinition = {
  id: "test-hum",
  kind: "audio",
  label: "Test hum",
  defaultPlace: "post-gate",
  cost: "light",
  isSupported: () => true,
  create({ audioContext }) {
    const node = audioContext.createGain();
    const hum = audioContext.createConstantSource();
    hum.offset.value = 0.1;
    hum.connect(node);
    hum.start();
    return Promise.resolve({
      input: node,
      output: node,
      dispose: () => {
        hum.stop();
        hum.disconnect();
        node.disconnect();
      },
    });
  },
};

/** A wet-only echo of native nodes, with a tail of a few seconds. */
const echoEffect: AudioEffectDefinition = {
  id: "test-echo",
  kind: "audio",
  label: "Test echo",
  defaultPlace: "send",
  cost: "light",
  tail: 4.5,
  isSupported: () => true,
  create({ audioContext }) {
    const input = audioContext.createGain();
    const delay = audioContext.createDelay(1);
    const feedback = audioContext.createGain();
    delay.delayTime.value = 0.2;
    feedback.gain.value = 0.7;
    input.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    return Promise.resolve({
      input,
      output: delay,
      dispose: () => {
        for (const node of [input, delay, feedback]) node.disconnect();
      },
    });
  },
};

/** Kernels for the hosted test effects: a worklet file can't be bundled. */
const KERNELS = `
modularAV.registerAudioKernel("test-comb", class {
  constructor({ sampleRate }) {
    this.line = new Float32Array(Math.round(sampleRate * 0.1));
    this.at = 0;
  }
  render(input, output) {
    for (let i = 0; i < output.length; i++) {
      const wet = this.line[this.at];
      this.line[this.at] = input[i] + wet * 0.7;
      this.at = (this.at + 1) % this.line.length;
      output[i] = wet;
    }
  }
});
modularAV.registerAudioKernel("test-broken", class {
  render() { throw new Error("The test kernel always fails"); }
});
`;

const kernelsUrl = (): string =>
  URL.createObjectURL(new Blob([KERNELS], { type: "text/javascript" }));

function hostedEffect(id: string, kernel: string): AudioEffectDefinition {
  return {
    id,
    kind: "audio",
    label: id,
    defaultPlace: "send",
    cost: "light",
    tail: 2,
    isSupported: () => true,
    create: ({ host }) => host({ module: kernelsUrl(), name: kernel }),
  };
}

/** What a worklet effect looks like when it works on every block. */
const BUSY_WORKLET = `
registerProcessor("test-busy", class extends AudioWorkletProcessor {
  process() {
    let sum = 0;
    for (let i = 0; i < 50000; i++) sum += Math.sqrt(i);
    this.sum = sum;
    return true;
  }
});
`;

/** Breaks the tail effects contract: costs too much on silence. */
const busyEffect: AudioEffectDefinition = {
  id: "test-bad-busy",
  kind: "audio",
  label: "Test busy",
  defaultPlace: "send",
  cost: "light",
  isSupported: () => true,
  async create({ audioContext }) {
    await audioContext.audioWorklet.addModule(
      URL.createObjectURL(
        new Blob([BUSY_WORKLET], { type: "text/javascript" }),
      ),
    );
    const node = new AudioWorkletNode(audioContext, "test-busy");
    return {
      input: node,
      output: node,
      dispose: () => {
        node.disconnect();
      },
    };
  },
};

/** Breaks it too: a send effect that passes the voice on, doubling it. */
const leakyEffect: AudioEffectDefinition = {
  ...gainEffect,
  id: "test-bad-leaky",
  label: "Test leaky",
  defaultPlace: "send",
};

/** Breaks it too: a long echo that declares no tail. */
const liarEffect: AudioEffectDefinition = {
  ...echoEffect,
  id: "test-bad-liar",
  label: "Test liar",
  tail: 0,
};

/** A denoise effect that sends digital silence, as a stalled model does. */
const silentEffect: AudioEffectDefinition = {
  id: "test-silent",
  kind: "audio",
  label: "Test silent",
  defaultPlace: "pre-gate",
  cost: "light",
  isSupported: () => true,
  create({ audioContext }) {
    const node = audioContext.createGain();
    node.gain.value = 0;
    return Promise.resolve({
      input: node,
      output: node,
      dispose: () => {
        node.disconnect();
      },
    });
  },
};

/** Never starts: its state goes to "failed", for UIs to show. */
const failingEffect: AudioEffectDefinition = {
  id: "test-fail",
  kind: "audio",
  label: "Test failing",
  defaultPlace: "post-gate",
  cost: "light",
  isSupported: () => true,
  create: () => Promise.reject(new Error("The test effect always fails")),
};

/** Passes the camera's frames through, unless told to stall. */
function passEffect(stall: () => boolean): VideoEffectDefinition {
  return {
    id: "test-pass",
    kind: "video",
    label: "Test pass-through",
    cost: "medium",
    isSupported: () => "MediaStreamTrackGenerator" in globalThis,
    create() {
      const output = new insertable.MediaStreamTrackGenerator({
        kind: "video",
      });
      const writer = output.writable.getWriter();
      let pump: AbortController | null = null;
      let first: (() => void) | null = null;
      const feed = (input: MediaStreamTrack): void => {
        pump?.abort();
        const controller = new AbortController();
        pump = controller;
        const reader = new insertable.MediaStreamTrackProcessor({
          track: input,
        }).readable.getReader();
        // Read through a call: the signal aborts while a read is pending.
        const aborted = (): boolean => controller.signal.aborted;
        void (async () => {
          while (!aborted()) {
            const { value, done } = await reader.read();
            if (done) return;
            if (stall() || aborted()) {
              value.close();
              continue;
            }
            await writer.write(value);
            first?.();
            first = null;
          }
        })();
      };
      const effect: VideoEffect = {
        start(input) {
          return new Promise((resolve) => {
            first = () => {
              resolve(output);
            };
            feed(input);
          });
        },
        replaceInput(input) {
          feed(input);
          return Promise.resolve();
        },
        dispose() {
          pump?.abort();
          output.stop();
        },
      };
      return Promise.resolve(effect);
    },
  };
}

interface AudioDataLike {
  readonly numberOfFrames: number;
  copyTo(
    destination: Float32Array,
    options: { planeIndex: number; format: "f32-planar" },
  ): void;
  close(): void;
}

/** Reads a clone of `track` sample by sample, so the sent one is untouched. */
async function recordAudio(
  track: MediaStreamTrack,
  ms: number,
): Promise<AudioRecording> {
  const clone = track.clone();
  const Processor = (
    globalThis as unknown as {
      MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => {
        readonly readable: ReadableStream<AudioDataLike>;
      };
    }
  ).MediaStreamTrackProcessor;
  const reader = new Processor({ track: clone }).readable.getReader();
  const until = performance.now() + ms;
  let peak = 0;
  let run = 0;
  let longestZeroRun = 0;
  let samples = 0;
  try {
    while (performance.now() < until) {
      const { value, done } = await reader.read();
      if (done) break;
      const data = new Float32Array(value.numberOfFrames);
      value.copyTo(data, { planeIndex: 0, format: "f32-planar" });
      value.close();
      for (const sample of data) {
        peak = Math.max(peak, Math.abs(sample));
        run = sample === 0 ? run + 1 : 0;
        longestZeroRun = Math.max(longestZeroRun, run);
      }
      samples += data.length;
    }
  } finally {
    await reader.cancel();
    clone.stop();
  }
  return { peak, longestZeroRun, samples };
}

/** Registers what the URL asks for in the `modularAV.register` hook. */
export function installPipeline(
  hooks: { on(name: string, fn: (api: ModularAV) => void): unknown },
  params: URLSearchParams,
  hub: MockServiceHub = createMockServiceHub(),
): PipelineControls {
  const published = new Map<TrackSource, MediaStreamTrack>();
  let stalled = false;
  let core: ModularAV | null = null;
  hooks.on("modularAV.register", (api) => {
    core = api;
    if (params.get("service") === "mock")
      api.services.register(recordingService(hub.definition(), published));
    if (params.get("effects") === "test") {
      api.effects.register(gainEffect);
      api.effects.register(humEffect);
      api.effects.register(echoEffect);
      api.effects.register(hostedEffect("test-hosted", "test-comb"));
      api.effects.register(hostedEffect("test-hosted-broken", "test-broken"));
      for (const effect of [busyEffect, leakyEffect, liarEffect])
        api.effects.register(effect);
      api.effects.register(passEffect(() => stalled));
      api.effects.register(failingEffect);
      api.effects.register(silentEffect);
    }
  });
  return {
    published: () =>
      Object.fromEntries(
        [...published].map(([source, t]) => [
          source,
          { id: t.id, label: t.label },
        ]),
      ),
    track: (source) => published.get(source) ?? null,
    record(source, ms) {
      const track = published.get(source);
      if (!track)
        return Promise.reject(new Error(`Nothing published as ${source}`));
      return recordAudio(track, ms);
    },
    async recordVoice(ms) {
      const [track] = core?.preview.voice()?.getAudioTracks() ?? [];
      if (!track) throw new Error("No voice to record");
      try {
        return await recordAudio(track, ms);
      } finally {
        track.stop();
      }
    },
    stallVideo(next) {
      stalled = next;
    },
  };
}
