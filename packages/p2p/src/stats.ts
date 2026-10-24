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

/**
 * The round trip of the candidate pair in use and the share of packets
 * lost since `previous`, from a `getStats()` report.
 */
export function readStats(
  report: ReadonlyMap<string, unknown>,
  previous: PacketTotals,
): StatsReading {
  let roundTrip: number | null = null;
  let totals: PacketTotals = { lost: 0, received: 0 };
  for (const entry of report.values()) {
    if (!isEntry(entry)) continue;
    if (
      entry.type === "candidate-pair" &&
      entry.nominated === true &&
      entry.state === "succeeded" &&
      typeof entry.currentRoundTripTime === "number"
    )
      roundTrip = entry.currentRoundTripTime;
    if (entry.type === "inbound-rtp")
      totals = {
        lost: totals.lost + count(entry.packetsLost),
        received: totals.received + count(entry.packetsReceived),
      };
  }
  const lost = Math.max(0, totals.lost - previous.lost);
  const received = Math.max(0, totals.received - previous.received);
  const stats: ConnectionStats = {
    ...(roundTrip === null
      ? {}
      : { roundTripMs: Math.round(roundTrip * 1000) }),
    ...(lost + received > 0 ? { packetLoss: lost / (lost + received) } : {}),
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
