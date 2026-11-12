import type { PublishedTrack, TrackSource } from "@modular-av/api";
import type { FrameSize } from "./frame-size.ts";
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
  screen: "video",
};

/** Measures a frame of a track that reports no size; null if none came. */
export type MeasureFrame = (
  track: MediaStreamTrack,
) => Promise<FrameSize | null>;

/** A browser's usual camera size, for a track whose frames didn't come. */
const USUAL_SIZE: FrameSize = { width: 640, height: 480 };

/**
 * lib-jitsi-meet sizes its simulcast layers from the camera's size, and
 * falls back to its own getUserMedia constraints, which a track it didn't
 * capture lacks. An effect's output (a MediaStreamTrackGenerator) reports
 * no size at all, and its frames follow the camera's resolution: measured.
 */
async function constraintsOf(
  track: MediaStreamTrack,
  measure: MeasureFrame,
): Promise<VideoConstraints> {
  const { width, height } = track.getSettings();
  const size =
    width && height
      ? { width, height }
      : ((await measure(track)) ?? USUAL_SIZE);
  return { width: { ideal: size.width }, height: { ideal: size.height } };
}

/** Takes the core's track out of the stream, then lets the library go. */
async function release(entry: Entry): Promise<void> {
  entry.stream.removeTrack(entry.track);
  await entry.jitsi.dispose();
}

/** The core's track in a stream of its own, as lib-jitsi-meet takes it. */
async function wrap(
  sdk: JitsiMeetJS,
  track: MediaStreamTrack,
  source: TrackSource,
  measure: MeasureFrame,
): Promise<Entry> {
  const kind = KINDS[source];
  if (!kind || kind !== track.kind)
    throw new Error(`Jitsi doesn't send ${source} tracks of ${track.kind}`);
  const constraints =
    kind === "video" ? await constraintsOf(track, measure) : null;
  const stream = new MediaStream([track]);
  const [jitsi] = sdk.createLocalTracksFromMediaStreams([
    constraints
      ? {
          stream,
          mediaType: kind,
          videoType: source === "screen" ? "desktop" : "camera",
          constraints,
        }
      : { stream, mediaType: kind },
  ]);
  if (!jitsi) throw new Error("lib-jitsi-meet made no track");
  return { source, stream, track, jitsi };
}

const VIDEO_NUMBER = /-v(\d+)$/;

const videoNumber = (entry: Entry): number =>
  Number(VIDEO_NUMBER.exec(entry.jitsi.getSourceName())?.[1] ?? -1);

/**
 * lib-jitsi-meet numbers the videos sent and takes the number for the
 * video's place among them: with the first one removed, the second one's
 * name points at nothing, and a camera turned on again gets the share's
 * name. Whether another video sent stands after this one.
 */
const standsBeforeAnother = (entry: Entry, sent: readonly Entry[]): boolean =>
  entry.jitsi.getType() === "video" &&
  sent.some((other) => videoNumber(other) > videoNumber(entry));

/**
 * Stops sending a video and keeps its place, the way the library mutes
 * a camera of its own (its `mute()` would stop the core's track): out
 * of the connection, signalled as muted, still in the conference.
 */
async function park(conference: JitsiConference, entry: Entry): Promise<void> {
  await conference._removeLocalTrackFromPc(entry.jitsi);
  entry.jitsi._sendMuteStatus(true);
  entry.stream.removeTrack(entry.track);
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
  all(): readonly Entry[];
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
    all: () => [...entries.values()],
  };
}

/** lib-jitsi-meet's own default for the tallest video sent: no limit of ours. */
const SENDER_MAX_HEIGHT = 2160;

/**
 * lib-jitsi-meet's replaceTrack keeps the encodings it chose for the old
 * camera (a 480p bitrate and layers), so a larger camera went out small.
 * Setting the sender limit again has it size them for the new one.
 */
const resizeLayers = (conference: JitsiConference): Promise<void> =>
  conference.setSenderVideoConstraint(SENDER_MAX_HEIGHT);

export function createLocalTracks(
  sdk: JitsiMeetJS,
  conference: () => JitsiConference | null,
  measure: MeasureFrame,
  onError: (error: unknown) => void,
): LocalTracks {
  const entries = createEntries();
  /** After leaving: a publish still under way lets its track go. */
  let closed = false;
  /** Videos no longer sent whose place is kept, by what they showed. */
  let parked = new Map<TrackSource, Entry>();
  const joined = (): JitsiConference => {
    const current = conference();
    if (!current) throw new Error("Not in a Jitsi conference");
    return current;
  };
  return {
    async publish(track, source) {
      const entry = await wrap(sdk, track, source, measure);
      const kept = parked.get(source);
      await sendOrRelease(entry, async () => {
        // Into the place kept for it, if it was sent before.
        if (kept) await joined().replaceTrack(kept.jitsi, entry.jitsi);
        else await joined().addTrack(entry.jitsi);
        if (closed) throw new Error("The Jitsi call was left meanwhile");
      });
      if (kept) {
        parked = new Map([...parked].filter(([, e]) => e !== kept));
        await kept.jitsi.dispose();
      }
      return { id: entries.add(source, entry), source };
    },
    async replace(published, track) {
      const old = entries.find(published.id);
      const entry = await wrap(sdk, track, old.source, measure);
      await sendOrRelease(entry, () =>
        joined().replaceTrack(old.jitsi, entry.jitsi),
      );
      entries.set(published.id, entry);
      await release(old);
      // The camera is sent by now: a failure here only leaves its layers
      // sized for the old one, so it is reported, not thrown.
      const current = conference();
      if (entry.source === "camera" && current)
        await resizeLayers(current).catch(onError);
    },
    async unpublish(published) {
      const entry = entries.take(published.id);
      if (!entry) return;
      const current = conference();
      if (current && standsBeforeAnother(entry, entries.all())) {
        await park(current, entry);
        parked = new Map(parked).set(entry.source, entry);
        return;
      }
      // The others see a removed video end by its mute signal, which
      // lib-jitsi-meet sends only for a track it finds live: not for one
      // the core stopped first (a share ending does), or whose stream is
      // empty. Their last frame would stay. Sent before the removal,
      // which takes the track out of the conference it signals through.
      if (current && entry.jitsi.getType() === "video")
        entry.jitsi._sendMuteStatus(true);
      try {
        await current?.removeTrack(entry.jitsi);
      } finally {
        await release(entry);
      }
    },
    /** Audio only, in the direction the core already set `enabled`. */
    async setMuted(published, muted) {
      const entry = entries.find(published.id);
      if (entry.source !== "microphone") return;
      await (muted ? entry.jitsi.mute() : entry.jitsi.unmute());
    },
    async releaseAll() {
      closed = true;
      const kept = [...parked.values()];
      parked = new Map();
      await Promise.all([
        ...entries.takeAll().map(release),
        ...kept.map((entry) => entry.jitsi.dispose()),
      ]);
    },
  };
}
