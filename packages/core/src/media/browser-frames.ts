/** The part of `MediaStreamTrackProcessor` (Chromium) the watchdog uses. */
interface TrackProcessor {
  readonly readable: ReadableStream<{ close(): void }>;
}

type TrackProcessorClass = new (init: {
  track: MediaStreamTrack;
}) => TrackProcessor;

const processorClass = (): TrackProcessorClass | undefined =>
  (globalThis as { MediaStreamTrackProcessor?: TrackProcessorClass })
    .MediaStreamTrackProcessor;

export const canWatchFrames = (): boolean => processorClass() !== undefined;

/**
 * Calls back per frame of a clone of `track`, read as a stream: unlike
 * `requestVideoFrameCallback`, this keeps going in a hidden tab.
 */
export function watchFrames(
  track: MediaStreamTrack,
  onFrame: () => void,
): () => void {
  const Processor = processorClass();
  if (!Processor) throw new Error("MediaStreamTrackProcessor is unavailable");
  const clone = track.clone();
  const reader = new Processor({ track: clone }).readable.getReader();
  let stopped = false;
  // Read through a call: `stopped` changes while a read is pending.
  const running = (): boolean => !stopped;
  const pump = async (): Promise<void> => {
    while (running()) {
      const { value, done } = await reader.read();
      if (done) return;
      value.close();
      if (running()) onFrame();
    }
  };
  // A track that ends just ends the stream; the watchdog sees no frames.
  pump().catch(() => undefined);
  return () => {
    stopped = true;
    reader.cancel().catch(() => undefined);
    clone.stop();
  };
}
