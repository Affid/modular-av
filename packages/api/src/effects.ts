/**
 * Effect plugin interfaces (docs/ARCHITECTURE.md, "How a module plugs in"). Effect modules
 * register their own Foundry settings under their own id and read them in
 * their effect; the core only turns effects on and off and chains them.
 */

/**
 * Where an audio effect runs: `pre-gate` → the core's voice gate → `post-gate`
 * in series, with a `send` beside them. The gate hears what `pre-gate` gives
 * it, so a tail there holds it open. A `post-gate` effect may ring on after the
 * gate closes, but must not make sound of its own: it only hears what the gate
 * passes. A `send` hears a copy taken after `post-gate`: use it for what adds
 * to the voice (reverb, delay), and `post-gate` when later effects must hear
 * the result or when the effect must be able to replace the voice.
 */
export type AudioPlace = "pre-gate" | "post-gate" | "send";

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
  /**
   * Runs a kernel in the core's worklet: the way to write a worklet effect
   * after the gate or on a send, as the core then skips it on silence.
   */
  readonly host: AudioEffectHost;
}

/**
 * An effect's sound code, run by the core's worklet. A kernel uses only what
 * its constructor (`{ sampleRate, options }`) and `configure` give it, and
 * from its scope only JavaScript's own built-ins, `console` and
 * `WebAssembly`: never the worklet's globals (`sampleRate`, `currentTime`,
 * `currentFrame`, `port`). Its options and `configure` values are plain data
 * (objects, arrays, strings, numbers, booleans, null) and raw bytes
 * (`ArrayBuffer` and typed arrays): pass WASM as bytes, not a compiled
 * module. The same file can then also run outside a browser.
 * `kernelContract` from `@modular-av/testing` checks both.
 */
export interface AudioEffectKernel {
  /**
   * A worklet module's URL, which calls
   * `modularAV.registerAudioKernel(name, class { render(input, output) {} })`.
   * Kernels can't be imported: a worklet loads no bundled code.
   */
  readonly module: string;
  readonly name: string;
  /** Given to the kernel's constructor: plain data and raw bytes. */
  readonly options?: unknown;
}

export interface HostedAudioEffect extends AudioEffect {
  /** Hands `value`, plain data and raw bytes, to the kernel's `configure`. */
  configure(value: unknown): void;
}

export type AudioEffectHost = (
  kernel: AudioEffectKernel,
) => Promise<HostedAudioEffect>;

export interface AudioEffectHostOptions {
  /** The effect's `tail`: how long to keep rendering after sound stops. */
  readonly tail?: number;
  /** Told when the kernel throws, or outputs a non-number. */
  readonly fail: (error: unknown) => void;
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
  readonly defaultPlace: AudioPlace;
  /**
   * It may send digital silence while the microphone hears noise (it
   * gates, as Krisp may). The core otherwise takes an effect that sends
   * digital silence for 1.5 s of sound out as stalled.
   */
  readonly silencesNoise?: boolean;
  /**
   * How long it keeps sounding after its input stops, in seconds. Say so for
   * a reverb or delay: the core gives it that long before taking its silence
   * for a stall. The contract checks the number.
   */
  readonly tail?: number;
  /**
   * How much it delays its output, in seconds, 0 for none. Declaring it gives
   * the effect a dry:wet control: the core delays the dry signal to match, so
   * the effect outputs only its processed signal. On a send it has a wet
   * control either way.
   */
  readonly latency?: number;
  /** Where its dry:wet or wet amount starts, 0 to 1; 1 if not given. */
  readonly defaultMix?: number;
  /** Lazy: import heavy code here, not at module load. */
  create(context: AudioEffectContext): Promise<AudioEffect>;
}

/** One runs at a time, on the camera: the audio chain's places don't apply. */
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
