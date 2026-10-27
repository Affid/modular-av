import type {
  ParticipantId,
  RemoteTrack,
  SubscriptionOptions,
} from "@modular-av/api";
import type { BridgeSource } from "./conference-events.ts";
import { requestsFor } from "./remote.ts";
import type { JitsiConference } from "./sdk-types.ts";

interface Subscribed extends SubscriptionOptions {
  readonly kind: string;
  readonly source: BridgeSource;
  readonly remote: Pick<RemoteTrack, "participant" | "source">;
}

/**
 * What the core wants of each remote source, sent to the bridge as
 * receiver constraints (video heights, 0 for none) and an audio
 * exclusion list, so refused media isn't even sent to this client. Only
 * sources still in the call are named.
 */
export interface Subscriptions {
  track(source: BridgeSource, kind: string, remote: RemoteTrack): void;
  /** A track went, or (no source name) all of an endpoint's did. */
  remove(source: BridgeSource | { readonly endpoint: string }): void;
  set(
    participant: ParticipantId,
    source: RemoteTrack["source"],
    options: SubscriptionOptions,
  ): void;
}

/** Keyed by endpoint too: a source name is only unique per owner. */
const keyOf = (source: BridgeSource): string =>
  `${source.endpoint}\u0000${source.sourceName}`;

function sendTo(
  conference: JitsiConference,
  entries: ReadonlyMap<string, Subscribed>,
): void {
  const byName = new Map(
    [...entries.values()].map((e) => [e.source.sourceName, e] as const),
  );
  const requests = requestsFor(byName);
  conference.setReceiverConstraints({
    lastN: -1,
    defaultConstraints: { maxHeight: 720 },
    constraints: requests.video,
  });
  conference.setAudioSubscriptionMode({
    all: true,
    include: [],
    exclude: requests.excludedAudio,
  });
}

export function createSubscriptions(
  conference: () => JitsiConference | null,
): Subscriptions {
  let entries = new Map<string, Subscribed>();
  const apply = (): void => {
    const current = conference();
    if (current) sendTo(current, entries);
  };
  return {
    track(source, kind, remote) {
      const known = entries.get(keyOf(source));
      entries = new Map(entries).set(keyOf(source), {
        enabled: known?.enabled ?? true,
        ...(known?.maxQuality ? { maxQuality: known.maxQuality } : {}),
        kind,
        source,
        remote: { participant: remote.participant, source: remote.source },
      });
    },
    remove(source) {
      const gone = (e: Subscribed): boolean =>
        e.source.endpoint === source.endpoint &&
        (!("sourceName" in source) ||
          e.source.sourceName === source.sourceName);
      const kept = [...entries].filter(([, e]) => !gone(e));
      if (kept.length !== entries.size) entries = new Map(kept);
    },
    set(participant, source, options) {
      let changed = false;
      const next = new Map(entries);
      for (const [key, entry] of entries)
        if (
          entry.remote.participant === participant &&
          entry.remote.source === source
        ) {
          next.set(key, {
            kind: entry.kind,
            source: entry.source,
            remote: entry.remote,
            ...options,
          });
          changed = true;
        }
      entries = next;
      if (changed) apply();
    },
  };
}
