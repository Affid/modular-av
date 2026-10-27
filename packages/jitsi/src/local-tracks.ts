import type { PublishedTrack, TrackSource } from "@modular-av/api";
import type {
  JitsiConference,
  JitsiLocalTrack,
  JitsiMeetJS,
  VideoConstraints,
} from "./sdk-types.ts";

/**
 * The core's tracks as lib-jitsi-meet sends them. The core owns every
 * track: lib-jitsi-meet stops the stream of a track it disposes, and its
 * video `mute()` stops the camera and asks for it again, so each track
 * goes in its own stream that this module empties before disposing, and
 * video is never muted through the library.
 */
export interface LocalTracks {
  publish(
    track: MediaStreamTrack,
    source: TrackSource,
  ): Promise<PublishedTrack>;
  replace(published: PublishedTrack, track: MediaStreamTrack): Promise<void>;
  unpublish(published: PublishedTrack): Promise<void>;
  setMuted(published: PublishedTrack, muted: boolean): Promise<void>;
  /** Lets go of every track without stopping any (leaving the call). */
  releaseAll(): Promise<void>;
}

interface Entry {
  readonly source: TrackSource;
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly jitsi: JitsiLocalTrack;
}

const KINDS: Partial<Record<TrackSource, "audio" | "video">> = {
  microphone: "audio",
  camera: "video",
};

/** The size a camera effect captures at (cam-background). */
const EFFECT_CAPTURE = { width: 640, height: 480 } as const;

/**
 * lib-jitsi-meet sizes its simulcast layers from the camera's size, and
 * falls back to its own getUserMedia constraints, which a track it didn't
 * capture lacks. An effect's output (a MediaStreamTrackGenerator) reports
 * no size at all: it is taken to be what effects capture.
 */
function constraintsOf(track: MediaStreamTrack): VideoConstraints {
  const { width, height } = track.getSettings();
  const size = width && height ? { width, height } : EFFECT_CAPTURE;
  return { width: { ideal: size.width }, height: { ideal: size.height } };
}

/** Takes the core's track out of the stream, then lets the library go. */
async function release(entry: Entry): Promise<void> {
  entry.stream.removeTrack(entry.track);
  await entry.jitsi.dispose();
}

/** The core's track in a stream of its own, as lib-jitsi-meet takes it. */
function wrap(
  sdk: JitsiMeetJS,
  track: MediaStreamTrack,
  source: TrackSource,
): Entry {
  const kind = KINDS[source];
  if (!kind || kind !== track.kind)
    throw new Error(`Jitsi doesn't send ${source} tracks of ${track.kind}`);
  const stream = new MediaStream([track]);
  const [jitsi] = sdk.createLocalTracksFromMediaStreams([
    kind === "video"
      ? {
          stream,
          mediaType: kind,
          videoType: "camera",
          constraints: constraintsOf(track),
        }
      : { stream, mediaType: kind },
  ]);
  if (!jitsi) throw new Error("lib-jitsi-meet made no track");
  return { source, stream, track, jitsi };
}

/** Runs `send`; if it fails, lets the new wrapper go before rethrowing. */
async function sendOrRelease(
  entry: Entry,
  send: () => Promise<void>,
): Promise<void> {
  try {
    await send();
  } catch (error: unknown) {
    await release(entry);
    throw error;
  }
}

/** The tracks sent, by the id given to the core. */
function createEntries(): {
  add(source: TrackSource, entry: Entry): string;
  set(id: string, entry: Entry): void;
  find(id: string): Entry;
  take(id: string): Entry | undefined;
  takeAll(): Entry[];
} {
  let entries = new Map<string, Entry>();
  let next = 0;
  return {
    add(source, entry) {
      next += 1;
      const id = `${source}-${String(next)}`;
      entries = new Map(entries).set(id, entry);
      return id;
    },
    set(id, entry) {
      entries = new Map(entries).set(id, entry);
    },
    find(id) {
      const entry = entries.get(id);
      if (!entry) throw new Error(`Unknown published track ${id}`);
      return entry;
    },
    take(id) {
      const entry = entries.get(id);
      const rest = new Map(entries);
      rest.delete(id);
      entries = rest;
      return entry;
    },
    takeAll() {
      const all = [...entries.values()];
      entries = new Map();
      return all;
    },
  };
}

export function createLocalTracks(
  sdk: JitsiMeetJS,
  conference: () => JitsiConference | null,
): LocalTracks {
  const entries = createEntries();
  /** After leaving: a publish still under way lets its track go. */
  let closed = false;
  const joined = (): JitsiConference => {
    const current = conference();
    if (!current) throw new Error("Not in a Jitsi conference");
    return current;
  };
  return {
    async publish(track, source) {
      const entry = wrap(sdk, track, source);
      await sendOrRelease(entry, async () => {
        await joined().addTrack(entry.jitsi);
        if (closed) throw new Error("The Jitsi call was left meanwhile");
      });
      return { id: entries.add(source, entry), source };
    },
    async replace(published, track) {
      const old = entries.find(published.id);
      const entry = wrap(sdk, track, old.source);
      await sendOrRelease(entry, () =>
        joined().replaceTrack(old.jitsi, entry.jitsi),
      );
      entries.set(published.id, entry);
      await release(old);
    },
    async unpublish(published) {
      const entry = entries.take(published.id);
      if (entry) await release(entry);
    },
    /** Audio only, in the direction the core already set `enabled`. */
    async setMuted(published, muted) {
      const entry = entries.find(published.id);
      if (entry.source !== "microphone") return;
      await (muted ? entry.jitsi.mute() : entry.jitsi.unmute());
    },
    async releaseAll() {
      closed = true;
      await Promise.all(entries.takeAll().map(release));
    },
  };
}
