import type { TrackSource } from "@modular-av/api";
import type { Sources } from "./messages.ts";
import type { PeerConnectionLike, TransceiverLike } from "./peer.ts";
import type { VideoLimits } from "./stats.ts";

/** What the core publishes: one track per kind, the same for the session. */
export type OutgoingSource = "microphone" | "camera";
export type OutgoingTracks = Readonly<
  Record<OutgoingSource, MediaStreamTrack | null>
>;
export type SourceMap = Sources["sources"];

export interface RemoteSourceTrack {
  readonly source: TrackSource;
  readonly track: MediaStreamTrack;
}

const OUTGOING = [
  { source: "microphone", kind: "audio" },
  { source: "camera", kind: "video" },
] as const;

const KIND: Readonly<Record<TrackSource, "audio" | "video">> = {
  microphone: "audio",
  "screen-audio": "audio",
  camera: "video",
  screen: "video",
};

/** This side's sending lines, one per outgoing source. */
export interface OwnLines {
  readonly bySource: ReadonlyMap<OutgoingSource, TransceiverLike>;
  readonly all: ReadonlySet<TransceiverLike>;
}

export function createOwnLines(
  pc: PeerConnectionLike,
  tracks: OutgoingTracks,
  onError: (error: unknown) => void,
): OwnLines {
  const bySource = new Map(
    OUTGOING.map(({ source, kind }) => [
      source,
      pc.addTransceiver(kind, { direction: "sendonly" }),
    ]),
  );
  for (const [source, line] of bySource) {
    const track = tracks[source];
    if (track) line.sender.replaceTrack(track).catch(onError);
  }
  return { bySource, all: new Set(bySource.values()) };
}

/** This side's negotiated lines, by media id, whether they carry a track. */
export function ownSources(own: OwnLines): SourceMap {
  return Object.fromEntries(
    OUTGOING.flatMap(({ source }) => {
      const mid = own.bySource.get(source)?.mid;
      return mid ? [[mid, source]] : [];
    }),
  );
}

/** The negotiated lines that carry a track now. */
export function ownSending(
  own: OwnLines,
  tracks: OutgoingTracks,
): readonly OutgoingSource[] {
  return OUTGOING.flatMap(({ source }) =>
    own.bySource.get(source)?.mid && tracks[source] ? [source] : [],
  );
}

/** The other side's lines, by the source it says each one carries. */
export function remoteLines(
  pc: PeerConnectionLike,
  own: OwnLines,
  sources: SourceMap,
): readonly (RemoteSourceTrack & { readonly line: TransceiverLike })[] {
  return Object.entries(sources).flatMap(([mid, source]) => {
    const line = pc
      .getTransceivers()
      .find((t) => t.mid === mid && !own.all.has(t));
    if (line?.receiver.track.kind !== KIND[source]) return [];
    return [{ source, track: line.receiver.track, line }];
  });
}

/**
 * Receives only what the other side announced and this side accepts:
 * every other line is negotiated inactive, so its media never arrives.
 */
export function applyDirections(
  pc: PeerConnectionLike,
  own: OwnLines,
  sources: SourceMap,
  refused: ReadonlySet<TrackSource>,
): void {
  const wanted = new Set(
    remoteLines(pc, own, sources)
      .filter(({ source }) => !refused.has(source))
      .map(({ line }) => line),
  );
  for (const line of pc.getTransceivers()) {
    if (own.all.has(line) || line.mid === null) continue;
    const direction = wanted.has(line) ? "recvonly" : "inactive";
    if (line.direction !== direction) line.direction = direction;
  }
}

/** Encodings exist once the line is negotiated; until then, nothing to do. */
export async function limitSender(
  line: TransceiverLike | undefined,
  limits: VideoLimits,
): Promise<void> {
  if (!line) return;
  const parameters = line.sender.getParameters();
  if (parameters.encodings.length === 0) return;
  await line.sender.setParameters({
    ...parameters,
    encodings: parameters.encodings.map((encoding) => ({
      ...encoding,
      ...limits,
    })),
  });
}
