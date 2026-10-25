import type {
  AudioEffect,
  AudioEffectContext,
  Observable,
} from "@modular-av/api";
import type { Bridge } from "./bridge.ts";
import {
  KRISP_DISABLED_EVENT,
  type KrispModule,
  type KrispProcessor,
  type KrispQuality,
} from "./krisp.ts";

export interface KrispDeps {
  readonly load: () => Promise<KrispModule>;
  /** The LiveKit room of the call (modular-av-livekit's API), null between calls. */
  readonly room: Observable<object | null>;
  readonly quality: () => KrispQuality;
  readonly createBridge: (context: AudioContext) => Bridge;
}

const notAllowed = (): DOMException =>
  new DOMException(
    "Krisp isn't enabled for this LiveKit project",
    "NotAllowedError",
  );

/** The call's room now, or the next one. */
function roomOf(
  room: Observable<object | null>,
  signal: AbortSignal,
): Promise<object> {
  const current = room.get();
  if (current) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      off();
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Krisp was turned off", "AbortError"),
      );
    };
    const off = room.subscribe((next) => {
      if (!next) return;
      off();
      signal.removeEventListener("abort", onAbort);
      resolve(next);
    });
    signal.addEventListener("abort", onAbort);
  });
}

/** Krisp runs once it checked the project through the room and turned on. */
async function enable(
  processor: KrispProcessor,
  room: Observable<object | null>,
  signal: AbortSignal,
): Promise<void> {
  await processor.onPublish(await roomOf(room, signal));
  await processor.setEnabled(true);
  signal.throwIfAborted();
  if (!processor.isEnabled()) throw notAllowed();
}

/**
 * Keeps Krisp on: it hears of each new room (after a reconnect), and if it
 * turns itself off it is turned on once more; failing that, the core takes
 * it out (audio goes on without it). Returns what stops watching.
 */
function keepOn(
  processor: KrispProcessor,
  processed: MediaStreamTrack,
  deps: KrispDeps,
  fail: (error: unknown) => void,
): () => void {
  const offRoom = deps.room.subscribe((next) => {
    if (next) processor.onPublish(next).catch(fail);
  });
  const onDisabled = (): void => {
    processor.setEnabled(true).then(() => {
      if (!processor.isEnabled()) fail(notAllowed());
    }, fail);
  };
  processed.addEventListener(KRISP_DISABLED_EVENT, onDisabled);
  return () => {
    offRoom();
    processed.removeEventListener(KRISP_DISABLED_EVENT, onDisabled);
  };
}

export async function startKrisp(
  deps: KrispDeps,
  { audioContext, signal, fail }: AudioEffectContext,
): Promise<AudioEffect> {
  const krisp = await deps.load();
  signal.throwIfAborted();
  if (!krisp.isKrispNoiseFilterSupported())
    throw new DOMException(
      "Krisp can't run in this browser",
      "NotSupportedError",
    );
  const bridge = deps.createBridge(audioContext);
  const processor = krisp.KrispNoiseFilter({ quality: deps.quality() });
  const stop = (): void => {
    bridge.dispose();
    processor.destroy().catch(() => undefined);
  };
  try {
    await processor.init({ kind: "audio", track: bridge.track, audioContext });
    const processed = processor.processedTrack;
    if (!processed) throw new Error("Krisp gave no output");
    bridge.attach(processed);
    await enable(processor, deps.room, signal);
    const unwatch = keepOn(processor, processed, deps, fail);
    return {
      input: bridge.input,
      output: bridge.output,
      dispose() {
        unwatch();
        stop();
      },
    };
  } catch (error: unknown) {
    stop();
    throw error;
  }
}
