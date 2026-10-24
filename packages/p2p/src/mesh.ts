import type {
  ConnectionQuality,
  ConnectionStats,
  ParticipantId,
  TrackSource,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import {
  createLink,
  type Link,
  type LinkMessage,
  type LinkState,
  type OutgoingSource,
  type OutgoingTracks,
  type RemoteSourceTrack,
} from "./link.ts";
import type { Signal } from "./messages.ts";
import type { PeerConnectionLike } from "./peer.ts";
import {
  createRoster,
  meet,
  part,
  type Presence,
  type Roster,
} from "./roster.ts";
import type { SignalBody, Signalling } from "./signalling.ts";
import { rate } from "./stats.ts";

/** A link down this long: the others are told the player left. */
export const LEAVE_AFTER_MS = 30_000;
/** A link down this long is started afresh by its impolite side, and again after as long. */
export const RESET_AFTER_MS = 15_000;

interface Peer {
  readonly presence: Presence;
  /** Counts this pair's links: a message of an older one is dropped. */
  readonly epoch: number;
  readonly link: Link;
  /** `participantJoined` was emitted, and no `participantLeft` since. */
  readonly joined: boolean;
  readonly emitted: readonly RemoteSourceTrack[];
  readonly downSince: number | null;
  readonly quality: ConnectionQuality | null;
}

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

/** Every link of one connection, and what the core hears about them. */
export interface Mesh {
  readonly roster: Roster;
  hello(): void;
  bye(): void;
  handle(signal: Signal, user: ParticipantId): void;
  /** Foundry says the user's last tab went away. */
  userLeft(user: ParticipantId): void;
  setTrack(
    source: OutgoingSource,
    track: MediaStreamTrack | null,
  ): Promise<void>;
  setRefused(user: ParticipantId, source: TrackSource, refused: boolean): void;
  linkStates(): readonly LinkState[];
  /** Rates each connected link, reporting changes; their average. */
  sampleStats(): Promise<ConnectionStats>;
  setConfiguration(configuration: RTCConfiguration): void;
  /** Closes every link quietly; the core clears what it showed. */
  close(): void;
}

const same = (a: RemoteSourceTrack, b: RemoteSourceTrack): boolean =>
  a.source === b.source && a.track === b.track;

function toBody(message: LinkMessage, to: string, epoch: number): SignalBody {
  return { ...message, to, epoch };
}

function average(all: readonly ConnectionStats[]): ConnectionStats {
  const trips = all.flatMap((s) =>
    s.roundTripMs === undefined ? [] : [s.roundTripMs],
  );
  const losses = all.flatMap((s) =>
    s.packetLoss === undefined ? [] : [s.packetLoss],
  );
  return {
    ...(trips.length > 0 ? { roundTripMs: Math.max(...trips) } : {}),
    ...(losses.length > 0
      ? { packetLoss: losses.reduce((a, b) => a + b, 0) / losses.length }
      : {}),
  };
}

export function createMesh(deps: MeshDeps): Mesh {
  const { self } = deps;
  const state = {
    roster: createRoster(self),
    peers: new Map<ParticipantId, Peer>(),
    outgoing: { microphone: null, camera: null } as OutgoingTracks,
    refusals: new Map<ParticipantId, ReadonlySet<TrackSource>>(),
    timers: new Map<ParticipantId, readonly ReturnType<typeof setTimeout>[]>(),
    yielded: false,
  };
  const polite = (user: ParticipantId): boolean => self.user < user;

  const setPeer = (peer: Peer): void => {
    state.peers = new Map(state.peers).set(peer.presence.user, peer);
  };

  const clearTimers = (user: ParticipantId): void => {
    for (const timer of state.timers.get(user) ?? []) clearTimeout(timer);
    const timers = new Map(state.timers);
    timers.delete(user);
    state.timers = timers;
  };

  const addTimer = (user: ParticipantId, ms: number, run: () => void): void => {
    const timer = setTimeout(run, ms);
    state.timers = new Map(state.timers).set(user, [
      ...(state.timers.get(user) ?? []),
      timer,
    ]);
  };

  const setQuality = (peer: Peer, quality: ConnectionQuality | null): Peer => {
    if (peer.quality === quality) return peer;
    if (quality) deps.events.emit("quality", peer.presence.user, quality);
    return { ...peer, quality };
  };

  /** Brings the tracks the core knows in line with what the link carries. */
  const syncTracks = (peer: Peer): Peer => {
    const participant = peer.presence.user;
    const wanted = peer.joined ? peer.link.remoteTracks() : [];
    for (const gone of peer.emitted.filter(
      (t) => !wanted.some((w) => same(w, t)),
    ))
      deps.events.emit("trackRemoved", { participant, ...gone });
    for (const added of wanted.filter(
      (w) => !peer.emitted.some((t) => same(w, t)),
    ))
      deps.events.emit("trackAdded", { participant, ...added });
    return { ...peer, emitted: wanted };
  };

  /** The link has been down too long: the others hear the player left. */
  const leave = (user: ParticipantId): void => {
    const peer = state.peers.get(user);
    if (!peer?.joined || peer.link.state === "connected") return;
    const gone = syncTracks({ ...peer, joined: false });
    deps.events.emit("participantLeft", user);
    setPeer({ ...gone, quality: null });
    deps.onChange();
  };

  const startDown = (peer: Peer): Peer => {
    const user = peer.presence.user;
    addTimer(user, LEAVE_AFTER_MS, () => {
      leave(user);
    });
    const scheduleReset = (): void => {
      addTimer(user, RESET_AFTER_MS, () => {
        const current = state.peers.get(user);
        if (typeof current?.downSince !== "number") return;
        replaceLink(current, current.epoch + 1);
        scheduleReset();
      });
    };
    if (!polite(user)) scheduleReset();
    const down = { ...peer, downSince: deps.now() };
    return peer.joined ? setQuality(down, "lost") : down;
  };

  const reconcile = (peer: Peer): Peer => {
    let next = peer;
    const user = peer.presence.user;
    if (peer.link.state === "connected") {
      clearTimers(user);
      if (!next.joined) {
        deps.events.emit("participantJoined", user);
        next = { ...next, joined: true };
      }
      if (next.downSince !== null) next = { ...next, downSince: null };
      if (next.quality === "lost") next = setQuality(next, "good");
    } else if (peer.link.state === "down" && peer.downSince === null) {
      next = startDown(next);
    }
    return syncTracks(next);
  };

  const update = (user: ParticipantId, link: Link): void => {
    const peer = state.peers.get(user);
    if (peer?.link !== link) return;
    setPeer(reconcile(peer));
    deps.onChange();
  };

  const openLink = (presence: Presence, epoch: number): Link => {
    const { user, session } = presence;
    const link: Link = createLink({
      pc: deps.createPeerConnection(),
      polite: polite(user),
      tracks: state.outgoing,
      send: (message) => {
        deps.signalling.send(user, toBody(message, session, epoch));
      },
      onChange: () => {
        update(user, link);
      },
      onError: deps.onError,
    });
    for (const source of state.refusals.get(user) ?? [])
      link.setRefused(source, true);
    return link;
  };

  /** A new link to the same session; what the old one showed goes once replaced. */
  function replaceLink(peer: Peer, epoch: number): void {
    peer.link.close();
    const link = openLink(peer.presence, epoch);
    setPeer(reconcile({ ...peer, epoch, link }));
    deps.onChange();
  }

  const addPeer = (presence: Presence): void => {
    setPeer({
      presence,
      epoch: 0,
      link: openLink(presence, 0),
      joined: false,
      emitted: [],
      downSince: null,
      quality: null,
    });
  };

  const removePeer = (user: ParticipantId): void => {
    const peer = state.peers.get(user);
    if (!peer) return;
    clearTimers(user);
    peer.link.close();
    syncTracks({ ...peer, joined: false });
    if (peer.joined) deps.events.emit("participantLeft", user);
    const peers = new Map(state.peers);
    peers.delete(user);
    state.peers = peers;
  };

  const meetSignal = (
    signal: Extract<Signal, { type: "hello" | "welcome" }>,
    user: ParticipantId,
  ): void => {
    const presence = { user, session: signal.from, joinedAt: signal.joinedAt };
    const { roster, meeting } = meet(state.roster, presence);
    state.roster = roster;
    if (meeting.kind === "yield") {
      if (!state.yielded) deps.onYield();
      state.yielded = true;
      return;
    }
    if (meeting.kind === "replaced") removePeer(user);
    if (meeting.kind === "added" || meeting.kind === "replaced")
      addPeer(presence);
    const answer =
      signal.type === "hello" &&
      ["added", "replaced", "known", "outlived"].includes(meeting.kind);
    if (answer)
      deps.signalling.send(user, {
        type: "welcome",
        to: signal.from,
        joinedAt: self.joinedAt,
      });
    deps.onChange();
  };

  const linkSignal = (
    signal: Extract<Signal, { epoch: number }>,
    user: ParticipantId,
  ): void => {
    const peer = state.peers.get(user);
    if (peer?.presence.session !== signal.from || signal.epoch < peer.epoch)
      return;
    // The other side started a new link: this side follows.
    if (signal.epoch > peer.epoch) replaceLink(peer, signal.epoch);
    const message: LinkMessage =
      signal.type === "description"
        ? { type: "description", description: signal.description }
        : signal.type === "candidate"
          ? { type: "candidate", candidate: signal.candidate }
          : { type: "sources", sources: signal.sources };
    state.peers.get(user)?.link.receive(message);
  };

  const leaveSession = (user: ParticipantId, session: string): void => {
    if (state.peers.get(user)?.presence.session !== session) return;
    removePeer(user);
    state.roster = part(state.roster, user, session);
    deps.onChange();
  };

  return {
    get roster() {
      return state.roster;
    },
    hello() {
      deps.signalling.broadcast({ type: "hello", joinedAt: self.joinedAt });
    },
    bye() {
      deps.signalling.broadcast({ type: "bye" });
    },
    handle(signal, user) {
      if (signal.type === "hello" || signal.type === "welcome")
        meetSignal(signal, user);
      else if (signal.type === "bye") leaveSession(user, signal.from);
      else linkSignal(signal, user);
    },
    userLeft(user) {
      const session = state.peers.get(user)?.presence.session;
      if (session) leaveSession(user, session);
    },
    async setTrack(source, track) {
      state.outgoing = { ...state.outgoing, [source]: track };
      await Promise.all(
        [...state.peers.values()].map((p) => p.link.setTrack(source, track)),
      );
    },
    setRefused(user, source, refused) {
      const current = new Set(state.refusals.get(user) ?? []);
      if (refused) current.add(source);
      else current.delete(source);
      state.refusals = new Map(state.refusals).set(user, current);
      state.peers.get(user)?.link.setRefused(source, refused);
    },
    // A link started afresh is down until it connects.
    linkStates: () =>
      [...state.peers.values()].map((p) =>
        p.downSince === null ? p.link.state : "down",
      ),
    async sampleStats() {
      const live = [...state.peers.values()].filter(
        (p) => p.joined && p.link.state === "connected",
      );
      const readings = await Promise.all(
        live.map(async (peer) => ({ peer, stats: await peer.link.stats() })),
      );
      for (const { peer, stats } of readings) {
        const current = state.peers.get(peer.presence.user);
        if (current?.link === peer.link && current.link.state === "connected")
          setPeer(setQuality(current, rate(stats)));
      }
      return average(readings.map((r) => r.stats));
    },
    setConfiguration(configuration) {
      for (const peer of state.peers.values())
        peer.link.setConfiguration(configuration);
    },
    close() {
      for (const [user, peer] of state.peers) {
        clearTimers(user);
        peer.link.close();
      }
      state.peers = new Map();
    },
  };
}
