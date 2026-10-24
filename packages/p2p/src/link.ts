import type { ConnectionStats, TrackSource } from "@modular-av/api";
import type { CandidateInit, SessionDescription, Sources } from "./messages.ts";
import { createNegotiation } from "./negotiation.ts";
import type { PeerConnectionLike, TransceiverLike } from "./peer.ts";
import { type PacketTotals, readStats, type VideoLimits } from "./stats.ts";

/** What the core publishes: one track per kind, the same for the session. */
export type OutgoingSource = "microphone" | "camera";
export type OutgoingTracks = Readonly<
  Record<OutgoingSource, MediaStreamTrack | null>
>;

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

export type LinkMessage =
  | { readonly type: "description"; readonly description: SessionDescription }
  | { readonly type: "candidate"; readonly candidate: CandidateInit | null }
  | { readonly type: "sources"; readonly sources: Sources["sources"] };

/** `down`: the path broke; ICE may still recover it. */
export type LinkState = "connecting" | "connected" | "down" | "closed";

export interface RemoteSourceTrack {
  readonly source: TrackSource;
  readonly track: MediaStreamTrack;
}

export interface LinkDeps {
  readonly pc: PeerConnectionLike;
  readonly polite: boolean;
  readonly tracks: OutgoingTracks;
  readonly send: (message: LinkMessage) => void;
  /** Its state or the remote tracks changed. */
  readonly onChange: () => void;
  readonly onError: (error: unknown) => void;
}

/** The media path to one other session, over one `RTCPeerConnection`. */
export interface Link {
  readonly state: LinkState;
  receive(message: LinkMessage): void;
  setTrack(
    source: OutgoingSource,
    track: MediaStreamTrack | null,
  ): Promise<void>;
  /** Refused media is negotiated inactive, so it never arrives at all. */
  setRefused(source: TrackSource, refused: boolean): void;
  /** What the other side sends, by source, whether refused or not. */
  remoteTracks(): readonly RemoteSourceTrack[];
  limitVideo(limits: VideoLimits): Promise<void>;
  stats(): Promise<ConnectionStats>;
  setConfiguration(configuration: RTCConfiguration): void;
  close(): void;
}

const STATES: Readonly<Record<RTCPeerConnectionState, LinkState>> = {
  new: "connecting",
  connecting: "connecting",
  connected: "connected",
  disconnected: "down",
  failed: "down",
  closed: "closed",
};

const toInit = (candidate: RTCIceCandidate): CandidateInit => {
  const json = candidate.toJSON();
  return {
    candidate: json.candidate ?? "",
    sdpMid: json.sdpMid ?? null,
    sdpMLineIndex: json.sdpMLineIndex ?? null,
    ...(json.usernameFragment
      ? { usernameFragment: json.usernameFragment }
      : {}),
  };
};

/** The other side's lines, by the source it says each one carries. */
function remoteLines(
  pc: PeerConnectionLike,
  own: ReadonlySet<TransceiverLike>,
  sources: Sources["sources"],
): readonly (RemoteSourceTrack & { readonly line: TransceiverLike })[] {
  return Object.entries(sources).flatMap(([mid, source]) => {
    const line = pc.getTransceivers().find((t) => t.mid === mid && !own.has(t));
    if (line?.receiver.track.kind !== KIND[source]) return [];
    return [{ source, track: line.receiver.track, line }];
  });
}

export function createLink(deps: LinkDeps): Link {
  const { pc } = deps;
  const lines = new Map(
    OUTGOING.map(({ source, kind }) => [
      source,
      pc.addTransceiver(kind, { direction: "sendonly" }),
    ]),
  );
  const own: ReadonlySet<TransceiverLike> = new Set(lines.values());
  let tracks = deps.tracks;
  let remoteSources: Sources["sources"] = {};
  let refused: ReadonlySet<TrackSource> = new Set();
  let sentSources: string | null = null;
  let state = STATES[pc.connectionState];
  let totals: PacketTotals = { lost: 0, received: 0 };

  /** Only lines with a media id and a track are announced. */
  const sendSources = (): void => {
    const sources = Object.fromEntries(
      OUTGOING.flatMap(({ source }) => {
        const mid = lines.get(source)?.mid;
        return mid && tracks[source] ? [[mid, source]] : [];
      }),
    );
    const key = JSON.stringify(sources);
    if (key === sentSources) return;
    sentSources = key;
    deps.send({ type: "sources", sources });
  };

  const applyRefusals = (): void => {
    for (const { source, line } of remoteLines(pc, own, remoteSources)) {
      const wanted = refused.has(source) ? "inactive" : "recvonly";
      if (line.direction !== wanted) line.direction = wanted;
    }
  };

  const negotiation = createNegotiation({
    pc,
    polite: deps.polite,
    send: (message) => {
      deps.send(
        "description" in message
          ? { type: "description", description: message.description }
          : { type: "candidate", candidate: message.candidate },
      );
    },
    onDescriptionSent: sendSources,
    onDescriptionApplied: () => {
      applyRefusals();
      deps.onChange();
    },
    onError: deps.onError,
  });

  for (const [source, line] of lines) {
    const track = tracks[source];
    if (track) line.sender.replaceTrack(track).catch(deps.onError);
  }
  wireEvents(pc, deps, (next) => {
    if (next === state) return;
    state = next;
    deps.onChange();
  });

  return {
    get state() {
      return state;
    },
    receive(message) {
      if (message.type === "description")
        void negotiation.receiveDescription(message.description);
      else if (message.type === "candidate")
        void negotiation.receiveCandidate(message.candidate);
      else {
        remoteSources = message.sources;
        applyRefusals();
        deps.onChange();
      }
    },
    async setTrack(source, track) {
      tracks = { ...tracks, [source]: track };
      await lines.get(source)?.sender.replaceTrack(track);
      sendSources();
    },
    setRefused(source, isRefused) {
      const next = new Set(refused);
      if (isRefused) next.add(source);
      else next.delete(source);
      refused = next;
      applyRefusals();
    },
    remoteTracks: () =>
      remoteLines(pc, own, remoteSources).map(({ source, track }) => ({
        source,
        track,
      })),
    limitVideo: (limits) => limitSender(lines.get("camera"), limits),
    async stats() {
      const reading = readStats(await pc.getStats(), totals);
      totals = reading.totals;
      return reading.stats;
    },
    setConfiguration(configuration) {
      pc.setConfiguration(configuration);
      pc.restartIce();
    },
    close() {
      state = "closed";
      pc.close();
    },
  };
}

/** Candidates out, and the connection state; the impolite side restarts ICE. */
function wireEvents(
  pc: PeerConnectionLike,
  deps: LinkDeps,
  setState: (state: LinkState) => void,
): void {
  pc.addEventListener("icecandidate", (event) => {
    const { candidate } = event as RTCPeerConnectionIceEvent;
    deps.send({
      type: "candidate",
      candidate: candidate ? toInit(candidate) : null,
    });
  });
  pc.addEventListener("track", () => {
    deps.onChange();
  });
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed" && !deps.polite) pc.restartIce();
    setState(STATES[pc.connectionState]);
  });
}

/** Encodings exist once the line is negotiated; until then, nothing to do. */
async function limitSender(
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
