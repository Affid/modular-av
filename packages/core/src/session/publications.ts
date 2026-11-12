import type {
  MediaPermissions,
  PublishedTrack,
  PublishRights,
  ServiceConnection,
  TrackSource,
} from "@modular-av/api";

export interface LocalTracks {
  readonly microphone: MediaStreamTrack | null;
  readonly camera: MediaStreamTrack | null;
  /** A shared screen, and its sound. */
  readonly screen: MediaStreamTrack | null;
  readonly screenAudio: MediaStreamTrack | null;
}

interface Publication {
  readonly published: PublishedTrack;
  readonly track: MediaStreamTrack;
  /** What the service was last told. */
  readonly muted: boolean | null;
}

interface SourcePlan {
  readonly source: TrackSource;
  track(tracks: LocalTracks): MediaStreamTrack | null;
  allowed(rights: PublishRights): boolean;
  /** Mute signalling: a share has none, it stops instead. */
  muted(outbound: MediaPermissions): boolean;
}

const SOURCES: readonly SourcePlan[] = [
  {
    source: "microphone",
    track: (t) => t.microphone,
    allowed: (r) => r.audio,
    muted: (o) => !o.audio,
  },
  {
    source: "camera",
    track: (t) => t.camera,
    allowed: (r) => r.video,
    muted: (o) => !o.video,
  },
  {
    source: "screen",
    track: (t) => t.screen,
    allowed: (r) => r.screen ?? false,
    muted: () => false,
  },
  {
    source: "screen-audio",
    track: (t) => t.screenAudio,
    allowed: (r) => (r.screen ?? false) && r.audio,
    muted: () => false,
  },
];

/**
 * Keeps one connection's published tracks in line with the local tracks,
 * the publish rights and the mute signalling. Calls run one at a time.
 */
export interface Publications {
  sync(
    tracks: LocalTracks,
    canPublish: PublishRights,
    outbound: MediaPermissions,
  ): Promise<void>;
}

export function createPublications(
  connection: ServiceConnection,
): Publications {
  let current = new Map<TrackSource, Publication>();
  let queue: Promise<void> = Promise.resolve();

  const syncOne = async (
    source: TrackSource,
    track: MediaStreamTrack | null,
    allowed: boolean,
    muted: boolean,
  ): Promise<void> => {
    const existing = current.get(source);
    const wanted = allowed ? track : null;
    let next: Publication | null = existing ?? null;
    if (existing && !wanted) {
      await connection.unpublish(existing.published);
      next = null;
    } else if (existing && wanted && existing.track !== wanted) {
      await connection.replaceTrack(existing.published, wanted);
      next = { ...existing, track: wanted };
    } else if (!existing && wanted) {
      const published = await connection.publish(wanted, source);
      next = { published, track: wanted, muted: null };
    }
    if (next && next.muted !== muted) {
      await connection.setMuted(next.published, muted);
      next = { ...next, muted };
    }
    const updated = new Map(current);
    if (next) updated.set(source, next);
    else updated.delete(source);
    current = updated;
  };

  return {
    sync(tracks, canPublish, outbound) {
      const run = queue.then(async () => {
        // One at a time (they share `current`), but one failing source
        // never keeps the other from syncing.
        let failure: Error | null = null;
        for (const plan of SOURCES) {
          try {
            await syncOne(
              plan.source,
              plan.track(tracks),
              plan.allowed(canPublish),
              plan.muted(outbound),
            );
          } catch (error: unknown) {
            failure ??=
              error instanceof Error
                ? error
                : new Error("Publishing failed", { cause: error });
          }
        }
        if (failure) throw failure;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
