/**
 * Everything the core does with devices, streams and elements goes through
 * this, so the session and media logic run in unit tests without a browser.
 * `browser-env.ts` is the real one; @modular-av/testing has a fake.
 */
import type { DeviceList } from "@modular-av/api";

export interface MediaEnv {
  /**
   * Rejects as `getUserMedia` does (NotAllowedError, NotFoundError…).
   * `noiseSuppression` is the browser's own, on unless turned off.
   */
  captureAudio(
    deviceId: string,
    options?: { readonly noiseSuppression?: boolean },
  ): Promise<MediaStreamTrack>;
  captureVideo(deviceId: string): Promise<MediaStreamTrack>;
  createStream(tracks: readonly MediaStreamTrack[]): MediaStream;
  createAudioOutput(): AudioOutput;
  /** Sets a video element's source; never unmutes it. */
  showVideo(element: HTMLVideoElement, stream: MediaStream | null): void;
  /** Calls back once `element` has left its document. */
  watchRemoval(element: Element, onRemoved: () => void): () => void;
  /**
   * Calls back when `element` comes into view or leaves it (in a visible
   * document, the Picture-in-Picture window too) or changes height. It
   * follows the element into another document.
   */
  watchOnScreen(
    element: Element,
    listener: (view: OnScreen) => void,
  ): () => void;
  /** Measures a played track's level. Loads its code lazily. */
  createLevelMeter(track: MediaStreamTrack): Promise<LevelMeter>;
  /**
   * A repeating timer in `element`'s window: the opener's timers slow down
   * in a hidden tab while a Picture-in-Picture window still shows.
   */
  every(element: Element, ms: number, run: () => void): () => void;
  /** The browser's `online` event. */
  onOnline(listener: () => void): () => void;
  /** Devices with an id; labels once access was granted. */
  listDevices(): Promise<DeviceList>;
  /** The browser's `devicechange` event. */
  onDeviceChange(listener: () => void): () => void;
  /** The one capture context; call once and keep it. Loads its code lazily. */
  createCaptureContext(): Promise<CaptureContext>;
  /** Whether `watchFrames` works here (MediaStreamTrackProcessor). */
  canWatchFrames(): boolean;
  /**
   * Calls back for each frame `track` delivers, also in a hidden tab, until
   * the returned function is called. Reads a clone: `track` is untouched.
   */
  watchFrames(track: MediaStreamTrack, onFrame: () => void): () => void;
}

/** Whether an element is seen, and how tall it is in device pixels (0: unknown). */
export interface OnScreen {
  readonly visible: boolean;
  readonly height: number;
}

/** Reads the level of one track. */
export interface LevelMeter {
  /** dBFS, -100 to 0. */
  read(): number;
  dispose(): void;
}

/** A report of the gate worklet's, in dBFS. */
export interface GateLevel {
  readonly db: number;
  readonly threshold: number;
}

/** "gate" silences the microphone while closed; "detect" only reports. */
export type GateMode = "gate" | "detect";

export interface GateConfig {
  readonly mode: GateMode;
  /** Follow the background noise, or use `threshold` (dBFS). */
  readonly auto: boolean;
  readonly threshold: number;
}

/** The voice gate worklet (public/worklets/voice-gate.js) in the context. */
export interface VoiceGateNode {
  readonly node: AudioNode;
  configure(config: GateConfig): void;
  /** Open and close transitions only. */
  onTransition(listener: (open: boolean) => void): () => void;
  /** The worklet stopped working: it no longer gates anything. */
  onError(listener: (error: unknown) => void): () => void;
  /** Level reports, 20 a second, only while turned on. */
  setLevels(enabled: boolean): void;
  onLevel(listener: (level: GateLevel) => void): () => void;
  dispose(): void;
}

/**
 * The core's one capture `AudioContext` (48 kHz) and the end of the
 * microphone chain. Its output track is the microphone the service gets:
 * the same track for the context's whole life, whatever the chain does.
 */
export interface CaptureContext {
  /** Given to audio effects. */
  readonly audioContext: AudioContext;
  readonly output: MediaStreamTrack;
  /** Where the chain ends. */
  readonly destination: AudioNode;
  createSource(track: MediaStreamTrack): AudioNode;
  createGate(config: GateConfig): Promise<VoiceGateNode>;
  /** Whether audio flows; browsers may keep a context suspended. */
  readonly running: boolean;
  onRunningChange(listener: (running: boolean) => void): () => void;
  resume(): Promise<void>;
  suspend(): Promise<void>;
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
