import type { TrackSource } from "@modular-av/api";

/**
 * Signalling messages on the core's socket (channel "p2p"). Foundry's
 * server names the sending user; everything else in a message is the
 * sender's word, checked here before anything reads it.
 */
export const PROTOCOL = 1;
/** Far above a real offer with four media lines. */
export const MAX_SDP_LENGTH = 65_536;
export const MAX_CANDIDATE_LENGTH = 1_024;
/** Each side's microphone and camera: four lines, with room for screen share. */
export const MAX_MEDIA_LINES = 8;
const MAX_SOURCES = 4;
const MAX_MLINE_INDEX = 15;
const MAX_EPOCH = 2 ** 31 - 1;

const SESSION = /^[\w-]{1,64}$/;
const MID = /^[\w-]{1,32}$/;
const MAX_ROOM_LENGTH = 128;
const MAX_UFRAG_LENGTH = 256;
const SOURCES: readonly TrackSource[] = [
  "microphone",
  "camera",
  "screen",
  "screen-audio",
];

/** `from` and `to` are session ids: one per connection, not per user. */
interface Base {
  readonly v: typeof PROTOCOL;
  readonly room: string;
  readonly from: string;
}

/** Sent to everyone on joining. */
export interface Hello extends Base {
  readonly type: "hello";
  readonly joinedAt: number;
}

/** The answer to a hello, to its sender only. */
export interface Welcome extends Base {
  readonly type: "welcome";
  readonly to: string;
  readonly joinedAt: number;
}

export interface SessionDescription {
  readonly type: "offer" | "answer";
  readonly sdp: string;
}

export interface CandidateInit {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment?: string;
}

/**
 * `epoch` counts the links between two sessions: a new one starts afresh.
 * The sender's sources come along, so they apply with the media lines.
 */
export interface Description extends Base {
  readonly type: "description";
  readonly to: string;
  readonly epoch: number;
  readonly description: SessionDescription;
  readonly sources: Readonly<Record<string, TrackSource>>;
}

export interface Candidate extends Base {
  readonly type: "candidate";
  readonly to: string;
  readonly epoch: number;
  /** Null: no more candidates. */
  readonly candidate: CandidateInit | null;
}

/** What the sender sends on which of its media lines, by media id. */
export interface Sources extends Base {
  readonly type: "sources";
  readonly to: string;
  readonly epoch: number;
  readonly sources: Readonly<Record<string, TrackSource>>;
}

/** Leaving: to one session, or without `to` to everyone. */
export interface Bye extends Base {
  readonly type: "bye";
  readonly to?: string;
}

export type Signal = Hello | Welcome | Description | Candidate | Sources | Bye;

type Fields = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSession = (value: unknown): value is string =>
  typeof value === "string" && SESSION.test(value);

const isEpoch = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= MAX_EPOCH;

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;

function parseBase(value: Fields): Base | null {
  const { v, room, from } = value;
  if (v !== PROTOCOL || !isSession(from)) return null;
  if (!isText(room, MAX_ROOM_LENGTH) || room.length === 0) return null;
  return { v: PROTOCOL, room, from };
}

/** Audio and video lines only, and few: no data channel, no line flood. */
function plausibleSdp(sdp: string): boolean {
  const lines = sdp.match(/^m=\w+/gm) ?? [];
  return (
    lines.length <= MAX_MEDIA_LINES &&
    lines.every((line) => line === "m=audio" || line === "m=video")
  );
}

function parseDescription(value: unknown): SessionDescription | null {
  if (!isRecord(value)) return null;
  const { type, sdp } = value;
  if (type !== "offer" && type !== "answer") return null;
  return isText(sdp, MAX_SDP_LENGTH) && plausibleSdp(sdp)
    ? { type, sdp }
    : null;
}

function parseCandidate(value: unknown): CandidateInit | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = value;
  if (!isText(candidate, MAX_CANDIDATE_LENGTH)) return undefined;
  if (sdpMid !== null && !(typeof sdpMid === "string" && MID.test(sdpMid)))
    return undefined;
  const index =
    sdpMLineIndex === null ||
    (Number.isInteger(sdpMLineIndex) &&
      (sdpMLineIndex as number) >= 0 &&
      (sdpMLineIndex as number) <= MAX_MLINE_INDEX);
  if (!index) return undefined;
  const init = {
    candidate,
    sdpMid,
    sdpMLineIndex: sdpMLineIndex as number | null,
  };
  if (usernameFragment === undefined) return init;
  return isText(usernameFragment, MAX_UFRAG_LENGTH)
    ? { ...init, usernameFragment }
    : undefined;
}

function parseSources(
  value: unknown,
): Readonly<Record<string, TrackSource>> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_SOURCES) return null;
  const valid = entries.every(
    ([mid, source]) => MID.test(mid) && SOURCES.includes(source as TrackSource),
  );
  const distinct = new Set(entries.map(([, source]) => source)).size;
  if (!valid || distinct !== entries.length) return null;
  return Object.fromEntries(entries) as Record<string, TrackSource>;
}

/** Fields of the messages to one session. */
function parseAddressed(value: Fields, base: Base): Signal | null {
  const { to, epoch } = value;
  if (!isSession(to)) return null;
  if (value.type === "welcome")
    return Number.isFinite(value.joinedAt)
      ? { ...base, type: "welcome", to, joinedAt: value.joinedAt as number }
      : null;
  if (!isEpoch(epoch)) return null;
  if (value.type === "description") {
    const description = parseDescription(value.description);
    const sources = parseSources(value.sources);
    return description && sources
      ? { ...base, type: "description", to, epoch, description, sources }
      : null;
  }
  if (value.type === "candidate") {
    const candidate = parseCandidate(value.candidate);
    return candidate === undefined
      ? null
      : { ...base, type: "candidate", to, epoch, candidate };
  }
  const sources = parseSources(value.sources);
  return sources ? { ...base, type: "sources", to, epoch, sources } : null;
}

const ADDRESSED = new Set(["welcome", "description", "candidate", "sources"]);

/** The message if it is well formed, else null. Unknown fields are dropped. */
export function parseSignal(value: unknown): Signal | null {
  if (!isRecord(value)) return null;
  const base = parseBase(value);
  if (!base) return null;
  const { type } = value;
  if (type === "hello")
    return Number.isFinite(value.joinedAt)
      ? { ...base, type, joinedAt: value.joinedAt as number }
      : null;
  if (type === "bye") {
    if (value.to === undefined) return { ...base, type };
    return isSession(value.to) ? { ...base, type, to: value.to } : null;
  }
  return typeof type === "string" && ADDRESSED.has(type)
    ? parseAddressed(value, base)
    : null;
}
