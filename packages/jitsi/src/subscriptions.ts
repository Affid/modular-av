import type {
  ParticipantId,
  RemoteTrack,
  SubscriptionOptions,
} from "@modular-av/api";
import { requestsFor } from "./remote.ts";
import type { JitsiConference } from "./sdk-types.ts";

interface Subscribed extends SubscriptionOptions {
  readonly kind: string;
  readonly remote: Pick<RemoteTrack, "participant" | "source">;
}

/**
 * What the core wants of each remote source, sent to the bridge as
 * receiver constraints (video heights, 0 for none) and an audio
 * exclusion list, so refused media isn't even sent to this client.
 */
export interface Subscriptions {
  /** A remote track arrived under this bridge source name. */
  track(sourceName: string, kind: string, remote: RemoteTrack): void;
  set(
    participant: ParticipantId,
    source: RemoteTrack["source"],
    options: SubscriptionOptions,
  ): void;
}

export function createSubscriptions(
  conference: () => JitsiConference | null,
): Subscriptions {
  let entries = new Map<string, Subscribed>();
  const apply = (): void => {
    const current = conference();
    if (!current) return;
    const requests = requestsFor(entries);
    current.setReceiverConstraints({
      lastN: -1,
      defaultConstraints: { maxHeight: 720 },
      constraints: requests.video,
    });
    current.setAudioSubscriptionMode({
      all: true,
      include: [],
      exclude: requests.excludedAudio,
    });
  };
  return {
    track(sourceName, kind, remote) {
      const known = entries.get(sourceName);
      entries = new Map(entries).set(sourceName, {
        enabled: known?.enabled ?? true,
        ...(known?.maxQuality ? { maxQuality: known.maxQuality } : {}),
        kind,
        remote: { participant: remote.participant, source: remote.source },
      });
    },
    set(participant, source, options) {
      let changed = false;
      const next = new Map(entries);
      for (const [name, entry] of entries)
        if (
          entry.remote.participant === participant &&
          entry.remote.source === source
        ) {
          next.set(name, {
            kind: entry.kind,
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
