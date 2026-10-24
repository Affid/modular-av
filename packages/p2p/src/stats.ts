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

/** Each link encodes the camera again, so every link gets a share. */
export function videoLimits(links: number): VideoLimits {
  const share = Math.floor(VIDEO_BUDGET_BPS / Math.max(1, links));
  return {
    maxBitrate: Math.min(VIDEO_BPS.max, Math.max(VIDEO_BPS.min, share)),
    scaleResolutionDownBy: links > FULL_SIZE_LINKS ? 2 : 1,
  };
}
