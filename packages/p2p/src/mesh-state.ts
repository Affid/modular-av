import type {
  ConnectionQuality,
  ConnectionStats,
  ParticipantId,
  TrackSource,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import type { Link, OutgoingTracks, RemoteSourceTrack } from "./link.ts";
import type { PeerConnectionLike } from "./peer.ts";
import { createRoster, type Presence, type Roster } from "./roster.ts";
import type { Signalling } from "./signalling.ts";

export interface MeshDeps {
  readonly self: Presence;
  readonly signalling: Signalling;
  readonly createPeerConnection: () => PeerConnectionLike;
  readonly events: Emitter;
  readonly now: () => number;
  /** A newer tab of this player joined: this connection gives way. */
  readonly onYield: () => void;
  /** The members or the state of a link changed. */
  readonly onChange: () => void;
  readonly onError: (error: unknown) => void;
}

export interface Peer {
  readonly presence: Presence;
  /** Counts this pair's links: a message of an older one is dropped. */
  readonly epoch: number;
  readonly link: Link;
  /** `participantJoined` was emitted, and no `participantLeft` since. */
  readonly joined: boolean;
  readonly emitted: readonly RemoteSourceTrack[];
  readonly downSince: number | null;
  readonly quality: ConnectionQuality | null;
  /** The link's last reading, for the connection details. */
  readonly stats: ConnectionStats | null;
}

type Timer = ReturnType<typeof setTimeout>;

/** One mesh's state; fields are replaced, never changed in place. */
export interface MeshState {
  readonly deps: MeshDeps;
  roster: Roster;
  peers: ReadonlyMap<ParticipantId, Peer>;
  outgoing: OutgoingTracks;
  refusals: ReadonlyMap<ParticipantId, ReadonlySet<TrackSource>>;
  timers: ReadonlyMap<ParticipantId, readonly Timer[]>;
  /** When the other side last made this side start a link afresh. */
  replacedAt: ReadonlyMap<ParticipantId, number>;
  yielded: boolean;
  closed: boolean;
}

export function createMeshState(deps: MeshDeps): MeshState {
  return {
    deps,
    roster: createRoster(deps.self),
    peers: new Map(),
    outgoing: { microphone: null, camera: null },
    refusals: new Map(),
    timers: new Map(),
    replacedAt: new Map(),
    yielded: false,
    closed: false,
  };
}

/** The smaller user id is the polite side of a link. */
export const isPolite = (st: MeshState, user: ParticipantId): boolean =>
  st.deps.self.user < user;

export function setPeer(st: MeshState, peer: Peer): void {
  st.peers = new Map(st.peers).set(peer.presence.user, peer);
}

export function deletePeer(st: MeshState, user: ParticipantId): void {
  const peers = new Map(st.peers);
  peers.delete(user);
  st.peers = peers;
}

const withoutTimer = (
  st: MeshState,
  user: ParticipantId,
  timer: Timer,
): void => {
  st.timers = new Map(st.timers).set(
    user,
    (st.timers.get(user) ?? []).filter((t) => t !== timer),
  );
};

/** Runs `run` after `ms` unless the peer's timers are cleared first. */
export function addTimer(
  st: MeshState,
  user: ParticipantId,
  ms: number,
  run: () => void,
): void {
  if (st.closed) return;
  const timer = setTimeout(() => {
    withoutTimer(st, user, timer);
    run();
  }, ms);
  st.timers = new Map(st.timers).set(user, [
    ...(st.timers.get(user) ?? []),
    timer,
  ]);
}

export function clearTimers(st: MeshState, user: ParticipantId): void {
  for (const timer of st.timers.get(user) ?? []) clearTimeout(timer);
  const timers = new Map(st.timers);
  timers.delete(user);
  st.timers = timers;
}

export function setQuality(
  st: MeshState,
  peer: Peer,
  quality: ConnectionQuality | null,
): Peer {
  if (peer.quality === quality) return peer;
  if (quality) st.deps.events.emit("quality", peer.presence.user, quality);
  return { ...peer, quality };
}

const same = (a: RemoteSourceTrack, b: RemoteSourceTrack): boolean =>
  a.source === b.source && a.track === b.track;

/** Brings the tracks the core knows in line with what the link carries. */
export function syncTracks(st: MeshState, peer: Peer): Peer {
  const participant = peer.presence.user;
  const wanted = peer.joined ? peer.link.remoteTracks() : [];
  const { events } = st.deps;
  for (const gone of peer.emitted.filter(
    (t) => !wanted.some((w) => same(w, t)),
  ))
    events.emit("trackRemoved", { participant, ...gone });
  for (const added of wanted.filter(
    (w) => !peer.emitted.some((t) => same(w, t)),
  ))
    events.emit("trackAdded", { participant, ...added });
  return { ...peer, emitted: wanted };
}
