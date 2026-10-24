import type {
  InputSensitivity,
  MediaPermissions,
  ParticipantId,
  SessionStatus,
} from "@modular-av/api";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { GateConfig } from "./env.ts";
import type { DeviceChoice } from "./local-media.ts";
import type { PlaybackPolicy } from "./remote-media.ts";

export interface OutboundInput {
  readonly facts: AVFacts;
  /** Foundry's broadcast intent: push to talk held. */
  readonly intent: boolean;
  readonly deafened: boolean;
  readonly hasMicrophone: boolean;
  readonly hasCamera: boolean;
}

/**
 * What the local player sends, from the sources of truth rather than from
 * Foundry's toggle calls: in "always" mode SimplePeer never re-enables the
 * mic after an unmute, and the core must not inherit that. In voice
 * activity mode the track stays on and the gate silences the pauses itself,
 * so the service isn't told "muted" at every breath.
 */
export function computeOutbound(input: OutboundInput): MediaPermissions {
  const { facts } = input;
  const own = facts.entry(facts.selfId);
  const allowed = facts.canBroadcast(facts.selfId);
  const intent = facts.voiceMode() !== "ptt" || input.intent;
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

/** Gate in voice activity mode; elsewhere it only detects speech. */
export function gateConfig(
  facts: AVFacts,
  sensitivity: InputSensitivity,
): GateConfig {
  return {
    mode: facts.voiceMode() === "activity" ? "gate" : "detect",
    ...sensitivity,
  };
}

/**
 * The devices to capture. The camera runs only while video can go out (in
 * a call, allowed, not hidden), so its light means something. The
 * microphone stays while muted, for an instant unmute and "speaking while
 * muted"; once the player left the call, both are freed.
 */
export function wantedDevices(
  facts: AVFacts,
  session: SessionStatus,
): DeviceChoice {
  if (session === "left") return { audio: null, video: null };
  const chosen = facts.devices();
  const shown =
    session !== "idle" &&
    facts.canBroadcast(facts.selfId).video &&
    !(facts.entry(facts.selfId).hidden ?? false);
  return { audio: chosen.audio, video: shown ? chosen.video : null };
}
