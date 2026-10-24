import type {
  ConnectionQuality,
  LocalState,
  MediaPermissions,
  ParticipantId,
  ParticipantState,
} from "@modular-av/api";

/**
 * Every state a tile can show, as `data-indicator` values (part of the UI
 * contract). The core decides them; a tile only shows what it is told.
 */
export type Indicator =
  | "muted"
  | "deafened"
  | "blocked-audio"
  | "blocked-video"
  | "hidden-by-me"
  | "connection"
  | "not-connected"
  | "open-mic"
  | "speaking-while-muted"
  | "camera-held";

/** Boolean attributes on the tile (`data-speaking`, `data-muted`…). */
export interface TileFlags {
  readonly speaking: boolean;
  readonly muted: boolean;
  readonly deafened: boolean;
  readonly blockedAudio: boolean;
  readonly blockedVideo: boolean;
  readonly connected: boolean;
  readonly hiddenByMe: boolean;
}

export interface TileView {
  readonly id: ParticipantId;
  /** From Foundry: shown as text only. */
  readonly name: string;
  readonly avatar: string | null;
  readonly color: string | null;
  readonly isLocal: boolean;
  /** `data-video`. */
  readonly video: "on" | "off" | "blocked";
  readonly quality: ConnectionQuality | null;
  readonly flags: TileFlags;
  /** In the order they are shown. */
  readonly indicators: readonly Indicator[];
}

const poorLink = (q: ConnectionQuality | null): boolean =>
  q === "poor" || q === "lost";

function localWarnings(local: LocalState): Indicator[] {
  return [
    ...(local.openMic ? (["open-mic"] as const) : []),
    ...(local.speakingWhileMuted ? (["speaking-while-muted"] as const) : []),
    ...(local.cameraHold ? (["camera-held"] as const) : []),
  ];
}

/**
 * A participant's tile. A kind the world's mode allows but `canBroadcast`
 * doesn't is a GM's block; a kind the mode disallows is nobody's block.
 */
export function tileView(
  p: ParticipantState,
  local: LocalState,
  worldMode: MediaPermissions,
): TileView {
  const flags: TileFlags = {
    speaking: p.speaking,
    muted: p.muted,
    deafened: p.deafened,
    blockedAudio: worldMode.audio && !p.canBroadcast.audio,
    blockedVideo: worldMode.video && !p.canBroadcast.video,
    connected: p.connected,
    hiddenByMe: p.hiddenByMe,
  };
  const indicators: Indicator[] = [
    ...(flags.muted ? (["muted"] as const) : []),
    ...(flags.deafened ? (["deafened"] as const) : []),
    ...(flags.blockedAudio ? (["blocked-audio"] as const) : []),
    ...(flags.blockedVideo ? (["blocked-video"] as const) : []),
    ...(flags.hiddenByMe ? (["hidden-by-me"] as const) : []),
    ...(!p.connected ? (["not-connected"] as const) : []),
    ...(p.connected && poorLink(p.quality) ? (["connection"] as const) : []),
    ...(p.isLocal ? localWarnings(local) : []),
  ];
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    isLocal: p.isLocal,
    video: flags.blockedVideo ? "blocked" : p.hasVideo ? "on" : "off",
    quality: p.quality,
    flags,
    indicators,
  };
}

const rank = (p: ParticipantState): number => (p.isLocal ? 0 : p.isGM ? 1 : 2);

/** The local player first, then GMs, then everyone by name. */
export function orderTiles(
  participants: readonly ParticipantState[],
): ParticipantState[] {
  return [...participants].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}
