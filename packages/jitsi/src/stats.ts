import type { ConnectionStats, ParticipantId } from "@modular-av/api";
import type { JitsiConference, JitsiMeetJS } from "./sdk-types.ts";

/** What lib-jitsi-meet's connection quality events carry (percentages). */
interface JitsiStats {
  readonly jvbRTT?: number;
  readonly packetLoss?: { readonly total?: number; readonly upload?: number };
  readonly transport?: readonly { readonly local_candidate_type?: string }[];
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const share = (percent: unknown): number | undefined =>
  isNumber(percent) ? percent / 100 : undefined;

/** Only the fields present: a service may not know some of them. */
function compact(stats: {
  readonly roundTripMs?: number | undefined;
  readonly packetLoss?: number | undefined;
  readonly relayed?: boolean | undefined;
}): ConnectionStats {
  return Object.fromEntries(
    Object.entries(stats).filter(([, value]) => value !== undefined),
  );
}

/** This client's link to the bridge. */
export function fromLocalStats(data: JitsiStats): ConnectionStats {
  const candidate = data.transport?.[0]?.local_candidate_type;
  return compact({
    roundTripMs: isNumber(data.jvbRTT) ? data.jvbRTT : undefined,
    packetLoss: share(data.packetLoss?.total),
    relayed: candidate === undefined ? undefined : candidate === "relay",
  });
}

/**
 * A participant's media reaches us through the bridge, so what matters is
 * their own link to it, which their client reports: its round trip and
 * what it loses sending.
 */
export function fromRemoteStats(data: JitsiStats): ConnectionStats {
  return compact({
    roundTripMs: isNumber(data.jvbRTT) ? data.jvbRTT : undefined,
    packetLoss: share(data.packetLoss?.upload),
  });
}

export interface StatsCache {
  own(): ConnectionStats;
  of(participant: ParticipantId): ConnectionStats | undefined;
}

/**
 * Keeps the latest measurements, which lib-jitsi-meet sends as events
 * (every 5 s here, see `sdk.ts`), keyed by bridge endpoint.
 */
export function createStatsCache(
  sdk: JitsiMeetJS,
  conference: JitsiConference,
  endpointOf: (participant: ParticipantId) => string | undefined,
): StatsCache {
  let own: ConnectionStats = {};
  let remote = new Map<string, ConnectionStats>();
  const events = sdk.events.connectionQuality;
  if (events.LOCAL_STATS_UPDATED)
    conference.on(events.LOCAL_STATS_UPDATED, (data: JitsiStats) => {
      own = fromLocalStats(data);
    });
  if (events.REMOTE_STATS_UPDATED)
    conference.on(
      events.REMOTE_STATS_UPDATED,
      (endpoint: string, data: JitsiStats) => {
        remote = new Map(remote).set(endpoint, fromRemoteStats(data));
      },
    );
  return {
    own: () => own,
    of(participant) {
      const endpoint = endpointOf(participant);
      return endpoint === undefined ? undefined : remote.get(endpoint);
    },
  };
}
