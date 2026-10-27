import type {
  ParticipantId,
  RemoteTrack,
  SubscriptionOptions,
  TrackSource,
} from "@modular-av/api";
import type { JitsiParticipant, JitsiTrack } from "./sdk-types.ts";

/**
 * The Foundry user id the server put in a participant's presence, from
 * their token (Prosody's presence_identity removes any a client sends).
 * Without it the server doesn't vouch for them: they are ignored.
 */
export function identityOf(
  participant: JitsiParticipant | undefined,
): ParticipantId | null {
  const id = participant?.getIdentity()?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A camera or microphone track; screen shares aren't carried. */
export function sourceOf(track: JitsiTrack): TrackSource | null {
  if (track.getType() === "audio") return "microphone";
  return track.getVideoType() === "desktop" ? null : "camera";
}

export function remoteTrack(
  participant: ParticipantId,
  track: JitsiTrack,
): RemoteTrack | null {
  const source = sourceOf(track);
  return source ? { participant, source, track: track.getTrack() } : null;
}

/** Heights asked of the bridge per quality (its simulcast layers). */
export const MAX_HEIGHTS = { low: 180, medium: 360, high: 720 } as const;

/** What to ask the bridge for, from the core's subscriptions per source. */
export interface Requests {
  readonly video: Readonly<Record<string, { maxHeight: number }>>;
  readonly excludedAudio: readonly string[];
}

export function requestsFor(
  subscriptions: ReadonlyMap<string, SubscriptionOptions & { kind: string }>,
): Requests {
  const video: Record<string, { maxHeight: number }> = {};
  const excludedAudio: string[] = [];
  for (const [sourceName, options] of subscriptions) {
    if (options.kind === "audio") {
      if (!options.enabled) excludedAudio.push(sourceName);
      continue;
    }
    video[sourceName] = {
      maxHeight: options.enabled
        ? MAX_HEIGHTS[options.maxQuality ?? "high"]
        : 0,
    };
  }
  return { video, excludedAudio };
}
