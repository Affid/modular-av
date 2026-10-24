import type { ParticipantId } from "@modular-av/api";
import type { LinkMessage } from "./link.ts";
import {
  addPeer,
  applyLimits,
  mayReplace,
  removePeer,
  replaceLink,
} from "./mesh-peers.ts";
import type { MeshState } from "./mesh-state.ts";
import type { Signal } from "./messages.ts";
import { meet, part } from "./roster.ts";

type Meeting = Extract<Signal, { type: "hello" | "welcome" }>;
type Linking = Extract<Signal, { epoch: number }>;

/** A known session says hello while its link is down: it started over. */
function restartIfDown(st: MeshState, user: ParticipantId): void {
  const peer = st.peers.get(user);
  if (typeof peer?.downSince !== "number" || !mayReplace(st, user)) return;
  replaceLink(st, peer, peer.epoch + 1);
}

/** A hello or a welcome: someone to link with, or a tab to give way to. */
export function meetSignal(
  st: MeshState,
  signal: Meeting,
  user: ParticipantId,
): void {
  const presence = { user, session: signal.from, joinedAt: signal.joinedAt };
  const { roster, meeting } = meet(st.roster, presence);
  if (meeting.kind === "yield") {
    if (!st.yielded) st.deps.onYield();
    st.yielded = true;
    return;
  }
  if (meeting.kind === "replaced" && !mayReplace(st, user)) return;
  st.roster = roster;
  if (meeting.kind === "replaced") removePeer(st, user);
  if (meeting.kind === "added" || meeting.kind === "replaced") {
    addPeer(st, presence);
    applyLimits(st);
  }
  if (meeting.kind === "known" && signal.type === "hello")
    restartIfDown(st, user);
  const answer =
    signal.type === "hello" &&
    ["added", "replaced", "known", "outlived"].includes(meeting.kind);
  if (answer)
    st.deps.signalling.send(user, {
      type: "welcome",
      to: signal.from,
      joinedAt: st.deps.self.joinedAt,
    });
  st.deps.onChange();
}

const toLinkMessage = (signal: Linking): LinkMessage => {
  if (signal.type === "description")
    return {
      type: "description",
      description: signal.description,
      sources: signal.sources,
    };
  if (signal.type === "candidate")
    return { type: "candidate", candidate: signal.candidate };
  return { type: "sources", sources: signal.sources };
};

/** A link's message; a newer epoch means the other side started afresh. */
export function linkSignal(
  st: MeshState,
  signal: Linking,
  user: ParticipantId,
): void {
  const peer = st.peers.get(user);
  if (peer?.presence.session !== signal.from || signal.epoch < peer.epoch)
    return;
  if (signal.epoch > peer.epoch) {
    if (!mayReplace(st, user)) return;
    replaceLink(st, peer, signal.epoch);
  }
  st.peers.get(user)?.link.receive(toLinkMessage(signal));
}

export function leaveSession(
  st: MeshState,
  user: ParticipantId,
  session: string,
): void {
  if (st.peers.get(user)?.presence.session !== session) return;
  removePeer(st, user);
  st.roster = part(st.roster, user, session);
  applyLimits(st);
  st.deps.onChange();
}
