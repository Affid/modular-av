/**
 * The parts of LiveKit's `@livekit/krisp-noise-filter` this module uses,
 * typed here: the package is never a dependency, its browsers load it from
 * npm (see loader.ts) and its shape is checked there.
 */
export const KRISP_VERSION = "0.4.5";

export type KrispQuality = "low" | "medium" | "high";

export interface KrispProcessor {
  /** Krisp's output, once `init` resolved. */
  readonly processedTrack?: MediaStreamTrack | undefined;
  init(options: {
    readonly kind: "audio";
    readonly track: MediaStreamTrack;
    readonly audioContext: AudioContext;
  }): Promise<void>;
  /** Checks the LiveKit project through the room, then turns itself on. */
  onPublish(room: object): Promise<void>;
  setEnabled(enable: boolean): Promise<boolean | undefined>;
  isEnabled(): boolean;
  destroy(): Promise<void>;
}

export interface KrispModule {
  KrispNoiseFilter(options: { readonly quality: KrispQuality }): KrispProcessor;
  isKrispNoiseFilterSupported(): boolean;
}

/** Krisp's event on its output track when it turns itself off. */
export const KRISP_DISABLED_EVENT = "disable-lk-krisp-noise-filter";
