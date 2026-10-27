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

export function createLocalTracks(
  sdk: JitsiMeetJS,
  conference: () => JitsiConference | null,
): LocalTracks {
  let entries = new Map<string, Entry>();
  let next = 0;

  const wrap = (track: MediaStreamTrack, source: TrackSource): Entry => {
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
  };
  const find = (published: PublishedTrack): Entry => {
    const entry = entries.get(published.id);
    if (!entry) throw new Error(`Unknown published track ${published.id}`);
    return entry;
  };
  const joined = (): JitsiConference => {
    const current = conference();
    if (!current) throw new Error("Not in a Jitsi conference");
    return current;
  };

  return {
    async publish(track, source) {
      const entry = wrap(track, source);
      await joined().addTrack(entry.jitsi);
      next += 1;
      const id = `${source}-${String(next)}`;
      entries = new Map(entries).set(id, entry);
      return { id, source };
    },
    async replace(published, track) {
      const old = find(published);
      const entry = wrap(track, old.source);
      await joined().replaceTrack(old.jitsi, entry.jitsi);
      entries = new Map(entries).set(published.id, entry);
      await release(old);
    },
    async unpublish(published) {
      const entry = entries.get(published.id);
      if (!entry) return;
      const rest = new Map(entries);
      rest.delete(published.id);
      entries = rest;
      await release(entry);
    },
    /** Audio only, in the direction the core already set `enabled`. */
    async setMuted(published, muted) {
      const entry = find(published);
      if (entry.source !== "microphone") return;
      await (muted ? entry.jitsi.mute() : entry.jitsi.unmute());
    },
    async releaseAll() {
      const all = [...entries.values()];
      entries = new Map();
      await Promise.all(all.map(release));
    },
  };
}
