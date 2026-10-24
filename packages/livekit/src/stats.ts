import type { ConnectionStats } from "@modular-av/api";

/** What livekit-client's getSenderStats() and getReceiverStats() report. */
export interface SenderReport {
  readonly timestamp: number;
  readonly roundTripTime?: number;
  readonly jitter?: number;
  readonly packetsSent?: number;
  readonly packetsLost?: number;
}

/** Packets so far from one player, to measure the loss since the last reading. */
export interface PacketTotals {
  readonly lost: number;
  readonly received: number;
}

type Entry = Readonly<Record<string, unknown>>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === "object" && value !== null;

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const ms = (seconds: number | undefined): number | undefined =>
  seconds === undefined ? undefined : Math.round(seconds * 1000);

const loss = (lost: number, total: number): ConnectionStats =>
  total > 0 ? { packetLoss: lost / total } : {};

/** This client's connection, from the microphone's sender (as the server sees it). */
export function fromSender(report: SenderReport | undefined): ConnectionStats {
  if (!report) return {};
  const roundTripMs = ms(report.roundTripTime);
  const jitterMs = ms(report.jitter);
  const lost = report.packetsLost ?? 0;
  return {
    ...(roundTripMs === undefined ? {} : { roundTripMs }),
    ...(jitterMs === undefined ? {} : { jitterMs }),
    ...loss(lost, (report.packetsSent ?? 0) + lost),
  };
}

/**
 * One player's media, from the `getStats()` reports of every receiver of
 * theirs: livekit-client's own receiver stats leave the audio's packet
 * counts out.
 */
export function fromReceivers(
  reports: readonly ReadonlyMap<string, unknown>[],
  previous: PacketTotals,
): { readonly stats: ConnectionStats; readonly totals: PacketTotals } {
  const inbound = reports.flatMap((r) =>
    [...r.values()].filter(isEntry).filter((e) => e.type === "inbound-rtp"),
  );
  const totals: PacketTotals = {
    lost: inbound.reduce((sum, e) => sum + count(e.packetsLost), 0),
    received: inbound.reduce((sum, e) => sum + count(e.packetsReceived), 0),
  };
  const jitters = inbound.flatMap((e) =>
    typeof e.jitter === "number" ? [e.jitter] : [],
  );
  const lost = Math.max(0, totals.lost - previous.lost);
  const received = Math.max(0, totals.received - previous.received);
  const jitterMs = jitters.length > 0 ? ms(Math.max(...jitters)) : undefined;
  return {
    stats: {
      ...(jitterMs === undefined ? {} : { jitterMs }),
      ...loss(lost, lost + received),
    },
    totals,
  };
}
