import type {
  AVState,
  ConnectionQuality,
  DeviceList,
  LocalState,
  ParticipantId,
  ParticipantState,
  ServiceState,
  SessionState,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { FoundryUser } from "../foundry/globals.ts";

export interface ProjectionInput {
  readonly facts: AVFacts;
  readonly users: readonly FoundryUser[];
  readonly session: SessionState;
  readonly service: ServiceState;
  readonly local: LocalState;
  readonly devices: DeviceList;
  /** Present in the call, as the service reports. */
  readonly connected: ReadonlySet<ParticipantId>;
  /** From the service, used when it detects speaking. */
  readonly speaking: ReadonlyMap<ParticipantId, boolean>;
  /** From the service, per participant. */
  readonly quality: ReadonlyMap<ParticipantId, ConnectionQuality>;
  hasMedia(participant: ParticipantId, kind: "audio" | "video"): boolean;
}

export const DEAFENED_FLAG = "deafened";

/** Deep equality for plain state data: lets selectors see "no change". */
function sameData<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    if (Object.is(x, y)) return true;
    return (
      typeof x === "object" &&
      typeof y === "object" &&
      x !== null &&
      y !== null &&
      !Array.isArray(x) &&
      sameData(x, y)
    );
  });
}

const keep = <T extends object>(previous: T | undefined, next: T): T =>
  previous && sameData(previous, next) ? previous : next;

function participant(
  input: ProjectionInput,
  user: FoundryUser,
): ParticipantState {
  const { facts, local } = input;
  const isLocal = user.id === facts.selfId;
  const activity = facts.settings()?.activity[user.id] ?? {};
  const serviceSpeaking =
    input.service.capabilities?.speakingDetection ?? false;
  const remoteSpeaking = serviceSpeaking
    ? (input.speaking.get(user.id) ?? false)
    : (activity.speaking ?? false);
  return {
    id: user.id,
    name: user.name,
    color: user.color ? String(user.color) : null,
    avatar: user.avatar ?? null,
    isGM: user.isGM,
    isLocal,
    active: user.active,
    connected: isLocal
      ? input.session.status === "connected"
      : input.connected.has(user.id),
    hasAudio: isLocal ? local.hasMicrophone : input.hasMedia(user.id, "audio"),
    hasVideo: isLocal
      ? local.hasCamera && local.videoEnabled
      : input.hasMedia(user.id, "video"),
    speaking: isLocal ? (activity.speaking ?? false) : remoteSpeaking,
    muted: isLocal ? local.muted : (activity.muted ?? false),
    hidden: isLocal ? !local.videoEnabled : (activity.hidden ?? false),
    deafened: user.getFlag(MODULE_ID, DEAFENED_FLAG) === true,
    canBroadcast: facts.canBroadcast(user.id),
    volume: facts.entry(user.id).volume ?? 1,
    hiddenByMe: !isLocal && (facts.entry(user.id).blocked ?? false),
    quality: input.quality.get(user.id) ?? null,
  };
}

/** Rebuilds the state, reusing every unchanged object of `previous`. */
export function project(
  input: ProjectionInput,
  previous: AVState | null,
): AVState {
  const shown = input.users.filter(
    (u) => u.active || u.id === input.facts.selfId || input.connected.has(u.id),
  );
  const participants = Object.fromEntries(
    shown.map((u) => [
      u.id,
      keep(previous?.participants[u.id], participant(input, u)),
    ]),
  );
  const next: AVState = {
    session: keep(previous?.session, input.session),
    participants: keep(previous?.participants, participants),
    local: keep(previous?.local, input.local),
    devices: keep(previous?.devices, input.devices),
    service: keep(previous?.service, input.service),
  };
  return previous && sameData(previous, next) ? previous : next;
}
