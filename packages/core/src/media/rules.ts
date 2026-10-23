import type { MediaPermissions, ParticipantId } from "@modular-av/api";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { PlaybackPolicy } from "./remote-media.ts";

export interface OutboundInput {
  readonly facts: AVFacts;
  /** Foundry's broadcast intent (push to talk, voice detection). */
  readonly intent: boolean;
  readonly deafened: boolean;
  readonly hasMicrophone: boolean;
  readonly hasCamera: boolean;
}

/**
 * What the local player sends, from the sources of truth rather than from
 * Foundry's toggle calls: in "always" mode SimplePeer never re-enables the
 * mic after an unmute, and the core must not inherit that.
 */
export function computeOutbound(input: OutboundInput): MediaPermissions {
  const { facts } = input;
  const own = facts.entry(facts.selfId);
  const allowed = facts.canBroadcast(facts.selfId);
  const intent = facts.voiceMode() === "always" || input.intent;
  return {
    audio:
      input.hasMicrophone &&
      allowed.audio &&
      intent &&
      !(own.muted ?? false) &&
      !input.deafened,
    video: input.hasCamera && allowed.video && !(own.hidden ?? false),
  };
}

/**
 * What this client agrees to play: the GM's blocks (the sender's
 * `BROADCAST_*` permissions), the world's mode, and this player's own
 * choices in Foundry (mute all, hide or mute someone, disable video).
 */
export function createPlaybackPolicy(
  facts: AVFacts,
  isDeafened: () => boolean,
): PlaybackPolicy {
  const refusedByMe = (id: ParticipantId): boolean =>
    facts.entry(id).blocked ?? false;
  return {
    canHear: (id) =>
      !isDeafened() &&
      !facts.muteAll() &&
      !refusedByMe(id) &&
      !(facts.entry(id).muted ?? false) &&
      facts.canBroadcast(id).audio,
    canSee: (id) =>
      !(facts.settings()?.client.disableVideo ?? false) &&
      !refusedByMe(id) &&
      !(facts.entry(id).hidden ?? false) &&
      facts.canBroadcast(id).video,
    volume: (id) => facts.entry(id).volume ?? 1,
    sinkId: () => facts.sinkId(),
  };
}
