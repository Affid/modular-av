/**
 * Everything the core does with devices, streams and elements goes through
 * this, so the session and media logic run in unit tests without a browser.
 * `browser-env.ts` is the real one; @modular-av/testing has a fake.
 */
export interface MediaEnv {
  /** Rejects as `getUserMedia` does (NotAllowedError, NotFoundError…). */
  captureAudio(deviceId: string): Promise<MediaStreamTrack>;
  captureVideo(deviceId: string): Promise<MediaStreamTrack>;
  createStream(tracks: readonly MediaStreamTrack[]): MediaStream;
  createAudioOutput(): AudioOutput;
  /** Sets a video element's source; never unmutes it. */
  showVideo(element: HTMLVideoElement, stream: MediaStream | null): void;
  /** Calls back once `element` has left its document. */
  watchRemoval(element: HTMLVideoElement, onRemoved: () => void): () => void;
  /** The browser's `online` event. */
  onOnline(listener: () => void): () => void;
}

/** Plays one remote audio track. */
export interface AudioOutput {
  play(track: MediaStreamTrack | null): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** "" or "default" for the system default. */
  setSinkId(sinkId: string): Promise<void>;
  dispose(): void;
}
