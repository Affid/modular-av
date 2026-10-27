import type { ConnectionQuality, ConnectionStats } from "@modular-av/api";
import type { DockContext } from "../context.ts";

/** How often connection numbers are read while shown; the core caches for a second. */
export const DETAILS_EVERY_MS = 2000;

const EXPECTED: ReadonlySet<unknown> = new Set([
  "not-ready",
  "unsupported",
  "unknown-participant",
]);

/** A command error the connection views expect, rather than a bug. */
export const isExpected = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  EXPECTED.has((error as { code?: unknown }).code);

export const qualityText = (
  ctx: DockContext,
  quality: ConnectionQuality,
): string => ctx.t(`connection.quality-${quality}`);

/**
 * Above these a link is no longer "excellent", then no longer "good": the
 * limits P2P rates each link by, so this client's rating and the players'
 * read alike.
 */
const EXCELLENT = { roundTripMs: 150, packetLoss: 0.01 } as const;
const GOOD = { roundTripMs: 300, packetLoss: 0.05 } as const;

/**
 * How a link feels, from what the service measured: the player's own
 * connection has no rating from every service (a P2P mesh rates each
 * link, not this client). Null when nothing was measured.
 */
export function qualityOf(stats: ConnectionStats): ConnectionQuality | null {
  const { roundTripMs, packetLoss } = stats;
  if (roundTripMs === undefined && packetLoss === undefined) return null;
  const within = (limit: typeof GOOD | typeof EXCELLENT): boolean =>
    (roundTripMs ?? 0) <= limit.roundTripMs &&
    (packetLoss ?? 0) <= limit.packetLoss;
  if (within(EXCELLENT)) return "excellent";
  return within(GOOD) ? "good" : "poor";
}
