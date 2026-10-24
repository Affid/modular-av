import type { ConnectionStats, TrackSource } from "@modular-av/api";
import {
  applyDirections,
  createOwnLines,
  limitSender,
  type OutgoingSource,
  type OutgoingTracks,
  type OwnLines,
  ownSending,
  ownSources,
  type RemoteSourceTrack,
  remoteLines,
  type SourceMap,
} from "./link-lines.ts";
import type { CandidateInit, SessionDescription } from "./messages.ts";
import { createNegotiation, type Negotiation } from "./negotiation.ts";
import type { PeerConnectionLike } from "./peer.ts";
import { type PacketTotals, readStats, type VideoLimits } from "./stats.ts";

export type {
  OutgoingSource,
  OutgoingTracks,
  RemoteSourceTrack,
} from "./link-lines.ts";

export type LinkMessage =
  | ({
      readonly type: "description";
      readonly description: SessionDescription;
    } & Announcement)
  | { readonly type: "candidate"; readonly candidate: CandidateInit | null }
  | ({ readonly type: "sources" } & Announcement);

/** A side's lines by media id, and which of their sources carry a track. */
export interface Announcement {
  readonly sources: SourceMap;
  readonly sending: readonly TrackSource[];
}

/** `down`: the path broke; ICE may still recover it. */
export type LinkState = "connecting" | "connected" | "down" | "closed";

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
  /**
   * After messages may have been lost (Foundry's socket reconnected): says
   * its sources again and withdraws an offer still waiting for its answer.
   */
  resync(): void;
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

/** One link's state; fields are replaced, never changed in place. */
interface LinkFields {
  closed: boolean;
  state: LinkState;
  tracks: OutgoingTracks;
  remoteSources: SourceMap;
  remoteSending: readonly TrackSource[];
  refused: ReadonlySet<TrackSource>;
  /** The sources last said, to say them once per change. */
  sentSources: string | null;
  totals: PacketTotals;
  /** Applied again after each negotiation: a line gets encodings then. */
  limits: VideoLimits | null;
}

interface Parts {
  readonly deps: LinkDeps;
  readonly own: OwnLines;
  readonly s: LinkFields;
  /** Quiet once closed: nothing goes out and nothing is reported. */
  readonly send: (message: LinkMessage) => void;
  readonly changed: () => void;
  readonly failed: (error: unknown) => void;
}

const directions = (p: Parts): void => {
  applyDirections(p.deps.pc, p.own, p.s.remoteSources, p.s.refused);
};

const limit = (p: Parts): Promise<void> =>
  p.s.limits
    ? limitSender(p.own.bySource.get("camera"), p.s.limits)
    : Promise.resolve();

/** What this side says about its lines, and remembers having said. */
function announce(p: Parts): Announcement {
  const announcement = {
    sources: ownSources(p.own),
    sending: ownSending(p.own, p.s.tracks),
  };
  p.s.sentSources = JSON.stringify(announcement);
  return announcement;
}

/** Says this side's sources, once per change unless `again`. */
function saySources(p: Parts, again = false): void {
  const before = p.s.sentSources;
  const announcement = announce(p);
  if (p.s.sentSources === before && !again) return;
  p.send({ type: "sources", ...announcement });
}

function negotiate(p: Parts): Negotiation {
  return createNegotiation({
    pc: p.deps.pc,
    polite: p.deps.polite,
    send: (message) => {
      if ("candidate" in message) {
        p.send({ type: "candidate", candidate: message.candidate });
        return;
      }
      p.send({
        type: "description",
        description: message.description,
        ...announce(p),
      });
    },
    onDescriptionApplied: () => {
      directions(p);
      limit(p).catch(p.failed);
      p.changed();
    },
    onError: p.failed,
  });
}

/** Candidates out, and the connection state; the impolite side restarts ICE. */
function wireEvents(p: Parts): void {
  const { pc } = p.deps;
  pc.addEventListener("icecandidate", (event) => {
    const { candidate } = event as RTCPeerConnectionIceEvent;
    p.send({
      type: "candidate",
      candidate: candidate ? toInit(candidate) : null,
    });
  });
  pc.addEventListener("track", p.changed);
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed" && !p.deps.polite) pc.restartIce();
    const next = STATES[pc.connectionState];
    if (next === p.s.state) return;
    p.s.state = next;
    p.changed();
  });
}

function createParts(deps: LinkDeps): Parts {
  const s: LinkFields = {
    closed: false,
    state: STATES[deps.pc.connectionState],
    tracks: deps.tracks,
    remoteSources: {},
    remoteSending: [],
    refused: new Set(),
    sentSources: null,
    totals: { lost: 0, received: 0 },
    limits: null,
  };
  const open =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      if (!s.closed) fn(...args);
    };
  return {
    deps,
    s,
    own: createOwnLines(deps.pc, deps.tracks, deps.onError),
    send: open(deps.send),
    changed: open(deps.onChange),
    failed: open(deps.onError),
  };
}

export function createLink(deps: LinkDeps): Link {
  const p = createParts(deps);
  const negotiation = negotiate(p);
  wireEvents(p);
  return linkApi(p, negotiation);
}

function receive(
  p: Parts,
  negotiation: Negotiation,
  message: LinkMessage,
): void {
  if (p.s.closed) return;
  if (message.type === "candidate") {
    void negotiation.receiveCandidate(message.candidate);
    return;
  }
  // Known before the description applies, so its lines start right.
  p.s.remoteSources = message.sources;
  p.s.remoteSending = message.sending;
  if (message.type === "description") {
    void negotiation.receiveDescription(message.description);
    return;
  }
  directions(p);
  p.changed();
}

function linkApi(p: Parts, negotiation: Negotiation): Link {
  const { pc } = p.deps;
  return {
    get state() {
      return p.s.state;
    },
    receive: (message) => {
      receive(p, negotiation, message);
    },
    async setTrack(source, track) {
      p.s.tracks = { ...p.s.tracks, [source]: track };
      await p.own.bySource.get(source)?.sender.replaceTrack(track);
      saySources(p);
    },
    setRefused(source, refused) {
      const next = new Set(p.s.refused);
      if (refused) next.add(source);
      else next.delete(source);
      p.s.refused = next;
      directions(p);
    },
    remoteTracks: () =>
      remoteLines(pc, p.own, p.s.remoteSources)
        .filter(({ source }) => p.s.remoteSending.includes(source))
        .map(({ source, track }) => ({ source, track })),
    limitVideo(limits) {
      p.s.limits = limits;
      return limit(p);
    },
    async stats() {
      const reading = readStats(await pc.getStats(), p.s.totals);
      p.s.totals = reading.totals;
      return reading.stats;
    },
    setConfiguration(configuration) {
      pc.setConfiguration(configuration);
      pc.restartIce();
    },
    resync() {
      saySources(p, true);
      void negotiation.unstick();
    },
    close() {
      p.s.closed = true;
      p.s.state = "closed";
      pc.close();
    },
  };
}
