import type {
  ConnectionStats,
  ParticipantId,
  TrackSource,
} from "@modular-av/api";
import type { LinkState, OutgoingSource } from "./link.ts";
import { applyLimits } from "./mesh-peers.ts";
import { leaveSession, linkSignal, meetSignal } from "./mesh-signals.ts";
import {
  clearTimers,
  createMeshState,
  type MeshDeps,
  type MeshState,
  setPeer,
  setQuality,
} from "./mesh-state.ts";
import type { Signal } from "./messages.ts";
import type { Roster } from "./roster.ts";
import { rate } from "./stats.ts";

export {
  CONNECT_TIMEOUT_MS,
  LEAVE_AFTER_MS,
  MIN_REPLACE_MS,
  RESET_AFTER_MS,
} from "./mesh-peers.ts";
export type { MeshDeps } from "./mesh-state.ts";

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
  /** The link to a joined player as last sampled, or null. */
  participantStats(user: ParticipantId): ConnectionStats | null;
  setConfiguration(configuration: RTCConfiguration): void;
  /** After Foundry's socket reconnected: says hello and resyncs every link. */
  resync(): void;
  /** Closes every link quietly; the core clears what it showed. */
  close(): void;
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

/** Rates each connected link and reports what changed. */
async function sampleStats(st: MeshState): Promise<ConnectionStats> {
  const live = [...st.peers.values()].filter(
    (p) => p.joined && p.link.state === "connected",
  );
  const readings = await Promise.all(
    live.map(async (peer) => ({ peer, stats: await peer.link.stats() })),
  );
  for (const { peer, stats } of readings) {
    const current = st.peers.get(peer.presence.user);
    if (current?.link === peer.link && current.link.state === "connected")
      setPeer(st, { ...setQuality(st, current, rate(stats)), stats });
  }
  return average(readings.map((r) => r.stats));
}

function setRefused(
  st: MeshState,
  user: ParticipantId,
  source: TrackSource,
  refused: boolean,
): void {
  const current = new Set(st.refusals.get(user) ?? []);
  if (refused) current.add(source);
  else current.delete(source);
  st.refusals = new Map(st.refusals).set(user, current);
  st.peers.get(user)?.link.setRefused(source, refused);
}

function setConfiguration(
  st: MeshState,
  configuration: RTCConfiguration,
): void {
  for (const { link } of st.peers.values()) {
    try {
      link.setConfiguration(configuration);
    } catch (error: unknown) {
      // A bad server in the settings: the other links still take it.
      st.deps.onError(error);
    }
  }
}

function close(st: MeshState): void {
  st.closed = true;
  for (const [user, peer] of st.peers) {
    clearTimers(st, user);
    peer.link.close();
  }
  st.peers = new Map();
}

export function createMesh(deps: MeshDeps): Mesh {
  const st = createMeshState(deps);
  const hello = (): void => {
    deps.signalling.broadcast({ type: "hello", joinedAt: deps.self.joinedAt });
  };
  return {
    get roster() {
      return st.roster;
    },
    hello,
    bye: () => {
      deps.signalling.broadcast({ type: "bye" });
    },
    handle(signal, user) {
      if (st.closed) return;
      if (signal.type === "hello" || signal.type === "welcome")
        meetSignal(st, signal, user);
      else if (signal.type === "bye") leaveSession(st, user, signal.from);
      else linkSignal(st, signal, user);
    },
    userLeft(user) {
      const session = st.peers.get(user)?.presence.session;
      if (session) leaveSession(st, user, session);
    },
    async setTrack(source, track) {
      st.outgoing = { ...st.outgoing, [source]: track };
      const links = [...st.peers.values()].map((p) => p.link);
      await Promise.all(links.map((link) => link.setTrack(source, track)));
      applyLimits(st);
    },
    setRefused: (user, source, refused) => {
      setRefused(st, user, source, refused);
    },
    // A link started afresh is down until it connects.
    linkStates: () =>
      [...st.peers.values()].map((p) =>
        p.downSince === null ? p.link.state : "down",
      ),
    sampleStats: () => sampleStats(st),
    participantStats(user) {
      const peer = st.peers.get(user);
      return peer?.joined ? peer.stats : null;
    },
    setConfiguration: (configuration) => {
      setConfiguration(st, configuration);
    },
    resync() {
      hello();
      for (const { link } of st.peers.values()) link.resync();
    },
    close: () => {
      close(st);
    },
  };
}
