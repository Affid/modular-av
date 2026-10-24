import type { ParticipantId } from "@modular-av/api";
import { createLink, type Link, type LinkMessage } from "./link.ts";
import {
  addTimer,
  clearTimers,
  deletePeer,
  isPolite,
  type MeshState,
  type Peer,
  setPeer,
  setQuality,
  syncTracks,
} from "./mesh-state.ts";
import { part, type Presence } from "./roster.ts";
import type { SignalBody } from "./signalling.ts";
import { videoLimits } from "./stats.ts";

/**
 * A link down this long: the player left and is dropped (a hello asks them
 * back). Longer than the connection's 30 s to "lost", so when every link
 * is down the core reconnects instead.
 */
export const LEAVE_AFTER_MS = 45_000;
/** A link down this long is started afresh by its impolite side. */
export const RESET_AFTER_MS = 15_000;
/**
 * A new link that hasn't connected by then counts as down: an offer lost
 * on the way would leave both sides waiting for an answer forever.
 */
export const CONNECT_TIMEOUT_MS = 15_000;
/** The other side may make this side start a link afresh this often. */
export const MIN_REPLACE_MS = 5_000;

function toBody(message: LinkMessage, to: string, epoch: number): SignalBody {
  return { ...message, to, epoch };
}

/** Whether the other side may make this side start afresh now; counts it. */
export function mayReplace(st: MeshState, user: ParticipantId): boolean {
  const last = st.replacedAt.get(user);
  const now = st.deps.now();
  if (last !== undefined && now - last < MIN_REPLACE_MS) return false;
  st.replacedAt = new Map(st.replacedAt).set(user, now);
  return true;
}

/** Each connected link's share of the upload for video. */
export function applyLimits(st: MeshState): void {
  const limits = videoLimits(st.peers.size);
  for (const { link } of st.peers.values())
    if (link.state === "connected")
      link.limitVideo(limits).catch(st.deps.onError);
}

/** The link has been down too long: the player left. A hello asks them back. */
function dropDead(st: MeshState, user: ParticipantId): void {
  const peer = st.peers.get(user);
  if (typeof peer?.downSince !== "number") return;
  const { session } = peer.presence;
  removePeer(st, user);
  st.roster = part(st.roster, user, session);
  st.deps.signalling.send(user, {
    type: "hello",
    joinedAt: st.deps.self.joinedAt,
  });
  applyLimits(st);
  st.deps.onChange();
}

function startDown(st: MeshState, peer: Peer): Peer {
  const user = peer.presence.user;
  addTimer(st, user, LEAVE_AFTER_MS, () => {
    dropDead(st, user);
  });
  if (!isPolite(st, user))
    addTimer(st, user, RESET_AFTER_MS, () => {
      const current = st.peers.get(user);
      if (typeof current?.downSince === "number")
        replaceLink(st, current, current.epoch + 1);
    });
  const down = { ...peer, downSince: st.deps.now() };
  return peer.joined ? setQuality(st, down, "lost") : down;
}

function reconcile(st: MeshState, peer: Peer): Peer {
  let next = peer;
  const user = peer.presence.user;
  if (peer.link.state === "connected") {
    clearTimers(st, user);
    if (!next.joined) {
      st.deps.events.emit("participantJoined", user);
      next = { ...next, joined: true };
    }
    if (next.downSince !== null) next = { ...next, downSince: null };
    if (next.quality === "lost") next = setQuality(st, next, "good");
  } else if (peer.link.state === "down" && peer.downSince === null) {
    next = startDown(st, next);
  }
  return syncTracks(st, next);
}

function update(st: MeshState, user: ParticipantId, link: Link): void {
  const peer = st.peers.get(user);
  if (st.closed || peer?.link !== link) return;
  setPeer(st, reconcile(st, peer));
  const justConnected = !peer.joined || peer.downSince !== null;
  if (link.state === "connected" && justConnected) applyLimits(st);
  st.deps.onChange();
}

function openLink(st: MeshState, presence: Presence, epoch: number): Link {
  const { user, session } = presence;
  const link: Link = createLink({
    pc: st.deps.createPeerConnection(),
    polite: isPolite(st, user),
    tracks: st.outgoing,
    send: (message) => {
      st.deps.signalling.send(user, toBody(message, session, epoch));
    },
    onChange: () => {
      update(st, user, link);
    },
    onError: st.deps.onError,
  });
  for (const source of st.refusals.get(user) ?? [])
    link.setRefused(source, true);
  return link;
}

/** A new link to the same session; what the old one showed goes once replaced. */
export function replaceLink(st: MeshState, peer: Peer, epoch: number): void {
  peer.link.close();
  const link = openLink(st, peer.presence, epoch);
  setPeer(st, reconcile(st, { ...peer, epoch, link }));
  st.deps.onChange();
}

export function addPeer(st: MeshState, presence: Presence): void {
  const { user } = presence;
  const link = openLink(st, presence, 0);
  setPeer(st, {
    presence,
    epoch: 0,
    link,
    joined: false,
    emitted: [],
    downSince: null,
    quality: null,
  });
  // Cleared once the link connects, like every timer of this peer.
  addTimer(st, user, CONNECT_TIMEOUT_MS, () => {
    const peer = st.peers.get(user);
    if (peer?.link !== link || peer.downSince !== null) return;
    setPeer(st, startDown(st, peer));
    st.deps.onChange();
  });
}

export function removePeer(st: MeshState, user: ParticipantId): void {
  const peer = st.peers.get(user);
  if (!peer) return;
  clearTimers(st, user);
  peer.link.close();
  syncTracks(st, { ...peer, joined: false });
  if (peer.joined) st.deps.events.emit("participantLeft", user);
  deletePeer(st, user);
}
