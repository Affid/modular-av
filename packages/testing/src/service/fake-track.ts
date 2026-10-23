export interface FakeTrackInfo {
  readonly enabled: boolean;
  readonly readyState: MediaStreamTrackState;
  readonly stopCalls: number;
}

let nextTrack = 1;

/** Enough of `MediaStreamTrack` for code that runs outside a browser. */
class FakeMediaStreamTrack extends EventTarget {
  readonly id = `fake-track-${String(nextTrack++)}`;
  readonly kind: "audio" | "video";
  readonly label: string;
  readonly muted = false;
  contentHint = "";
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  stopCalls = 0;
  onended: ((event: Event) => void) | null = null;
  onmute: ((event: Event) => void) | null = null;
  onunmute: ((event: Event) => void) | null = null;

  constructor(kind: "audio" | "video", label: string) {
    super();
    this.kind = kind;
    this.label = label;
  }

  stop(): void {
    this.stopCalls += 1;
    this.readyState = "ended";
  }

  clone(): FakeMediaStreamTrack {
    const copy = new FakeMediaStreamTrack(this.kind, this.label);
    copy.enabled = this.enabled;
    return copy;
  }

  getSettings(): MediaTrackSettings {
    return {};
  }

  getCapabilities(): MediaTrackCapabilities {
    return {};
  }

  getConstraints(): MediaTrackConstraints {
    return {};
  }

  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }
}

export function createFakeTrack(
  kind: "audio" | "video",
  label = `fake ${kind}`,
): MediaStreamTrack {
  return new FakeMediaStreamTrack(kind, label);
}

/** What a test needs to assert on a fake track; throws for real tracks. */
export function fakeTrackInfo(track: MediaStreamTrack): FakeTrackInfo {
  if (!((track as unknown) instanceof FakeMediaStreamTrack)) {
    throw new Error("not a fake track");
  }
  const fake = track as unknown as FakeMediaStreamTrack;
  return {
    enabled: fake.enabled,
    readyState: fake.readyState,
    stopCalls: fake.stopCalls,
  };
}
