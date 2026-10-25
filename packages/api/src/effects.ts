/**
 * Effect plugin interfaces (handoff §3 "Plugin interfaces"). Effect modules
 * register their own Foundry settings under their own id and read them in
 * their effect; the core only turns effects on and off and chains them.
 */

/** Audio order: denoise → voice → post → the core's voice gate. */
export type AudioStage = "denoise" | "voice" | "post";

/** Shown to players, so they can pick what their machine can run. */
export type EffectCost = "light" | "medium" | "heavy";

/** What a definition gives every effect it creates. */
export interface EffectContext {
  /** Aborted when the effect is turned off before `create()` resolved. */
  readonly signal: AbortSignal;
  /**
   * Reports a failure after `create()` resolved (e.g. a worklet error).
   * The core takes the effect out: audio goes on without it, the camera is
   * kept off.
   */
  readonly fail: (error: unknown) => void;
}

export interface AudioEffectContext extends EffectContext {
  /** The core's one capture context, at 48 kHz. */
  readonly audioContext: AudioContext;
}

interface EffectDefinitionBase {
  readonly id: string;
  /** Plain text or an i18n key. */
  readonly label: string;
  /**
   * One running effect per group. Effects in `"noise-suppression"` replace
   * the browser's own noise suppression, which the core turns off while one
   * runs.
   */
  readonly exclusiveGroup?: string;
  readonly cost: EffectCost;
  /**
   * Features the call's service must report (`ServiceCapabilities.features`).
   * Until it has, the effect is "unavailable": UIs don't offer it, and a
   * saved choice waits for it. Kept while the call reconnects.
   */
  readonly requires?: readonly string[];
  /** Whether this browser can run it. */
  isSupported(): boolean;
}

export interface AudioEffectDefinition extends EffectDefinitionBase {
  readonly kind: "audio";
  readonly stage: AudioStage;
  /**
   * It may send digital silence while the microphone hears noise (it
   * gates, as Krisp may). The core otherwise takes a denoise effect that
   * sends digital silence for 1.5 s of sound out as stalled.
   */
  readonly silencesNoise?: boolean;
  /** Lazy: import heavy code here, not at module load. */
  create(context: AudioEffectContext): Promise<AudioEffect>;
}

export interface VideoEffectDefinition extends EffectDefinitionBase {
  readonly kind: "video";
  /** Lazy: import heavy code here, not at module load. */
  create(context: EffectContext): Promise<VideoEffect>;
}

export type EffectDefinition = AudioEffectDefinition | VideoEffectDefinition;

/** An AudioNode chain in the core's capture context. */
export interface AudioEffect {
  readonly input: AudioNode;
  readonly output: AudioNode;
  dispose(): void;
}

export interface VideoEffect {
  /** Resolves with the processed track once its first frame is out. */
  start(input: MediaStreamTrack): Promise<MediaStreamTrack>;
  /** A camera restart or device change: keep the effect's state. */
  replaceInput(input: MediaStreamTrack): Promise<void>;
  dispose(): void;
}
