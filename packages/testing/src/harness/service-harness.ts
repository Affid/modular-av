/// <reference types="vite/client" />
// Service contract harness: drives one ServiceConnection of the service in
// ?service=<package dir> the way the core does, and records what it reports.
import type {
  PublishedTrack,
  RemoteTrack,
  ServiceConnection,
  ServiceDefinition,
  ServiceError,
  TrackSource,
} from "@modular-av/api";
import { meanLuminance, peakLevel } from "./service-probes.ts";
import type {
  CreateDefinition,
  JoinOptions,
  RecordedEvent,
  ServiceHarness,
  TrackView,
} from "./service-types.ts";

const definitions = import.meta.glob<{ createDefinition: CreateDefinition }>(
  "../../../*/test/service/definition.ts",
);

interface Local {
  readonly track: MediaStreamTrack;
  readonly published: PublishedTrack;
}

const serviceErrorOf = (error: unknown): ServiceError | null => {
  const candidate = (error as { serviceError?: ServiceError } | null)
    ?.serviceError;
  return candidate ?? null;
};

function createHarness(definition: ServiceDefinition): ServiceHarness {
  let connection: ServiceConnection | null = null;
  let events: RecordedEvent[] = [];
  let remote: RemoteTrack[] = [];
  let local = new Map<TrackSource, Local>();
  const record = (event: RecordedEvent): void => {
    events = [...events, event];
  };
  const live = (): ServiceConnection => {
    if (!connection) throw new Error("Not joined");
    return connection;
  };
  const remoteTrack = (
    participant: string,
    source: TrackSource,
  ): MediaStreamTrack | null =>
    remote.find((t) => t.participant === participant && t.source === source)
      ?.track ?? null;
  const sign = async (options: JoinOptions): Promise<string> => {
    if (options.token) return options.token;
    if (!definition.signToken) throw new Error("The service signs no tokens");
    return definition.signToken({
      participant: options.participant,
      room: options.room,
      canPublish: options.canPublish,
      ttlSeconds: options.ttlSeconds,
    });
  };

  const wire = (c: ServiceConnection): void => {
    c.on("state", (state, error) => {
      record({
        type: "state",
        state,
        ...(error ? { code: error.code, final: error.final } : {}),
      });
    });
    c.on("participantJoined", (participant) => {
      record({ type: "participantJoined", participant });
    });
    c.on("participantLeft", (participant) => {
      record({ type: "participantLeft", participant });
    });
    c.on("trackAdded", (t) => {
      remote = [...remote, t];
      record({
        type: "trackAdded",
        participant: t.participant,
        source: t.source,
        kind: t.track.kind,
      });
    });
    c.on("trackRemoved", (t) => {
      remote = remote.filter((r) => r.track !== t.track);
      record({
        type: "trackRemoved",
        participant: t.participant,
        source: t.source,
        kind: t.track.kind,
      });
    });
    c.on("speaking", (participant, speaking) => {
      record({ type: "speaking", participant, speaking });
    });
  };

  return {
    sign,
    async join(options) {
      try {
        const c = await definition.create({ participant: options.participant });
        wire(c);
        connection = c;
        await c.connect(
          { name: options.room },
          await sign(options),
          new AbortController().signal,
        );
        return { ok: true };
      } catch (error: unknown) {
        const reason = serviceErrorOf(error);
        return {
          ok: false,
          code: reason?.code ?? null,
          final: reason?.final ?? null,
          name: error instanceof Error ? error.name : "Error",
        };
      }
    },
    async publish(sources) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: sources.includes("microphone"),
        video: sources.includes("camera"),
      });
      const failures: string[] = [];
      for (const track of stream.getTracks()) {
        const source = track.kind === "audio" ? "microphone" : "camera";
        try {
          const published = await live().publish(track, source);
          local = new Map(local).set(source, { track, published });
        } catch (error: unknown) {
          failures.push(
            `${source}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return failures;
    },
    async setMuted(source, muted) {
      const entry = local.get(source);
      if (entry) await live().setMuted(entry.published, muted);
    },
    setEnabled(source, enabled) {
      const entry = local.get(source);
      if (entry) entry.track.enabled = enabled;
    },
    async unpublish(source) {
      const entry = local.get(source);
      if (entry) await live().unpublish(entry.published);
    },
    setSubscription(participant, source, enabled) {
      live().setSubscription(participant, source, { enabled });
    },
    async leave() {
      await live().disconnect("user");
    },
    events: () => events,
    remoteTracks: (): TrackView[] =>
      remote.map((t) => ({
        participant: t.participant,
        source: t.source,
        readyState: t.track.readyState,
        enabled: t.track.enabled,
      })),
    localTracks: (): TrackView[] =>
      [...local].map(([source, { track }]) => ({
        participant: "",
        source,
        readyState: track.readyState,
        enabled: track.enabled,
      })),
    audioLevel: (participant, ms) => {
      const track = remoteTrack(participant, "microphone");
      return track ? peakLevel(track, ms) : Promise.resolve(0);
    },
    videoBrightness: (participant) => {
      const track = remoteTrack(participant, "camera");
      return track ? meanLuminance(track) : Promise.resolve(0);
    },
  };
}

async function start(): Promise<ServiceHarness> {
  const params = new URLSearchParams(location.search);
  const dir = params.get("service") ?? "";
  const load = definitions[`../../../${dir}/test/service/definition.ts`];
  if (!load) throw new Error(`No service definition for "${dir}"`);
  const { createDefinition } = await load();
  const secrets = (await window.serviceSecrets?.()) ?? {};
  return createHarness(createDefinition(params, secrets));
}

window.serviceHarness = await start();
