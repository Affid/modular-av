import type {
  MediaPermissions,
  PublishedTrack,
  ServiceConnection,
  TrackSource,
} from "@modular-av/api";

export interface LocalTracks {
  readonly microphone: MediaStreamTrack | null;
  readonly camera: MediaStreamTrack | null;
}

interface Publication {
  readonly published: PublishedTrack;
  readonly track: MediaStreamTrack;
  /** What the service was last told. */
  readonly muted: boolean | null;
}

const SOURCES = [
  { source: "microphone", kind: "audio" },
  { source: "camera", kind: "video" },
] as const satisfies readonly {
  source: TrackSource;
  kind: keyof MediaPermissions;
}[];

/**
 * Keeps one connection's published tracks in line with the local tracks,
 * the publish rights and the mute signalling. Calls run one at a time.
 */
export interface Publications {
  sync(
    tracks: LocalTracks,
    canPublish: MediaPermissions,
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
        for (const { source, kind } of SOURCES) {
          const track =
            source === "microphone" ? tracks.microphone : tracks.camera;
          await syncOne(source, track, canPublish[kind], !outbound[kind]);
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
