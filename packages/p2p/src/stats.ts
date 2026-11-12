import type { ConnectionQuality, ConnectionStats } from "@modular-av/api";

/** Packets so far, to measure the loss since the last reading. */
export interface PacketTotals {
  readonly lost: number;
  readonly received: number;
}

export interface StatsReading {
  readonly stats: ConnectionStats;
  readonly totals: PacketTotals;
}

type Entry = Readonly<Record<string, unknown>>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === "object" && value !== null;

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const isPairInUse = (entry: Entry): boolean =>
  entry.type === "candidate-pair" &&
  entry.nominated === true &&
  entry.state === "succeeded";

/** The pair in use: its round trip and whether its local side is a relay. */
function readPair(report: ReadonlyMap<string, unknown>): ConnectionStats {
  const pair = [...report.values()]
    .filter(isEntry)
    .find((e) => isPairInUse(e) && typeof e.currentRoundTripTime === "number");
  if (!pair) return {};
  const local =
    typeof pair.localCandidateId === "string"
      ? report.get(pair.localCandidateId)
      : undefined;
  return {
    roundTripMs: Math.round(count(pair.currentRoundTripTime) * 1000),
    ...(isEntry(local) && typeof local.candidateType === "string"
      ? { relayed: local.candidateType === "relay" }
      : {}),
  };
}

/**
 * The round trip of the candidate pair in use (and whether it is relayed),
 * the worst jitter and the share of packets lost since `previous`, from a
 * `getStats()` report.
 */
export function readStats(
  report: ReadonlyMap<string, unknown>,
  previous: PacketTotals,
): StatsReading {
  const inbound = [...report.values()]
    .filter(isEntry)
    .filter((e) => e.type === "inbound-rtp");
  const totals: PacketTotals = {
    lost: inbound.reduce((sum, e) => sum + count(e.packetsLost), 0),
    received: inbound.reduce((sum, e) => sum + count(e.packetsReceived), 0),
  };
  const jitters = inbound.flatMap((e) =>
    typeof e.jitter === "number" ? [e.jitter] : [],
  );
  const lost = Math.max(0, totals.lost - previous.lost);
  const received = Math.max(0, totals.received - previous.received);
  const pair = readPair(report);
  const stats: ConnectionStats = {
    ...(pair.roundTripMs === undefined
      ? {}
      : { roundTripMs: pair.roundTripMs }),
    ...(lost + received > 0 ? { packetLoss: lost / (lost + received) } : {}),
    ...(jitters.length > 0
      ? { jitterMs: Math.round(Math.max(...jitters) * 1000) }
      : {}),
    ...(pair.relayed === undefined ? {} : { relayed: pair.relayed }),
  };
  return { stats, totals };
}

const EXCELLENT = { roundTripMs: 150, packetLoss: 0.01 } as const;
const GOOD = { roundTripMs: 300, packetLoss: 0.05 } as const;

/** What the core shows on a participant's tile; "lost" is a link down. */
export function rate(
  stats: ConnectionStats,
): Exclude<ConnectionQuality, "lost"> {
  const within = (limit: typeof GOOD | typeof EXCELLENT): boolean =>
    (stats.roundTripMs ?? 0) <= limit.roundTripMs &&
    (stats.packetLoss ?? 0) <= limit.packetLoss;
  if (within(EXCELLENT)) return "excellent";
  return within(GOOD) ? "good" : "poor";
}

/** What one player's upload can carry for video, shared by every link. */
const VIDEO_BUDGET_BPS = 2_400_000;
const VIDEO_BPS = { min: 150_000, max: 800_000 } as const;
/** Past this many links the camera is sent at half its size. */
const FULL_SIZE_LINKS = 4;

export interface VideoLimits {
  readonly maxBitrate: number;
  readonly scaleResolutionDownBy: number;
}

/** Which video this player sends now. */
export interface SentVideo {
  readonly camera: boolean;
  readonly screen: boolean;
}

/** The limits of each video line of a link. */
export interface VideoPlan {
  readonly camera: VideoLimits;
  readonly screen: VideoLimits;
}

/**
 * A screen share gets twice the camera's part: text on a map or a handout
 * must stay readable. It keeps its size for the same reason.
 */
const SCREEN_PARTS = 2;
const CAMERA_ONLY: SentVideo = { camera: true, screen: false };

/**
 * Each link encodes the video again, so every link gets a share of the
 * upload; a link's share is split between the camera and a screen share
 * while both are sent, so sharing never adds to what the upload carries.
 */
export function videoLimits(
  links: number,
  sent: SentVideo = CAMERA_ONLY,
): VideoPlan {
  const parts = (sent.camera ? 1 : 0) + (sent.screen ? SCREEN_PARTS : 0);
  const part = Math.floor(
    VIDEO_BUDGET_BPS / Math.max(1, links) / Math.max(1, parts),
  );
  const maxBitrate = Math.min(VIDEO_BPS.max, Math.max(VIDEO_BPS.min, part));
  return {
    camera: {
      maxBitrate,
      scaleResolutionDownBy: links > FULL_SIZE_LINKS ? 2 : 1,
    },
    screen: { maxBitrate: maxBitrate * SCREEN_PARTS, scaleResolutionDownBy: 1 },
  };
}
