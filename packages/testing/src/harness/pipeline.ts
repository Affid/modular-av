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
import { createMockServiceHub } from "../service/hub.ts";

/** What the published tracks are, by source, as the service was told. */
export type PublishedTracks = Partial<
  Record<TrackSource, { readonly id: string; readonly label: string }>
>;

export interface PipelineControls {
  published(): PublishedTracks;
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
  stage: "post",
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
        void (async () => {
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) return;
            if (stall() || controller.signal.aborted) {
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

/** Registers what the URL asks for in the `modularAV.register` hook. */
export function installPipeline(
  hooks: { on(name: string, fn: (api: ModularAV) => void): unknown },
  params: URLSearchParams,
): PipelineControls {
  const published = new Map<TrackSource, MediaStreamTrack>();
  let stalled = false;
  const hub = createMockServiceHub();
  hooks.on("modularAV.register", (api) => {
    if (params.get("service") === "mock")
      api.services.register(recordingService(hub.definition(), published));
    if (params.get("effects") === "test") {
      api.effects.register(gainEffect);
      api.effects.register(passEffect(() => stalled));
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
    stallVideo(next) {
      stalled = next;
    },
  };
}
