/**
 * Krisp takes and gives tracks, while the core's chain is made of nodes:
 * input node → track for Krisp; Krisp's track → output node, all in the
 * core's capture context.
 */
export interface Bridge {
  readonly input: AudioNode;
  /** What Krisp reads: whatever reaches `input`. */
  readonly track: MediaStreamTrack;
  readonly output: AudioNode;
  /** Plays Krisp's output track into `output`. */
  attach(processed: MediaStreamTrack): void;
  dispose(): void;
}

export function createBridge(context: AudioContext): Bridge {
  const input = context.createGain();
  const toTrack = context.createMediaStreamDestination();
  toTrack.channelCount = 1;
  toTrack.channelCountMode = "explicit";
  input.connect(toTrack);
  const [track] = toTrack.stream.getAudioTracks();
  if (!track) throw new Error("The bridge has no track");
  // Krisp turns the microphone's own noise suppression off through its
  // track, which a generated track refuses (OverconstrainedError). The
  // core already turns it off while a noise-suppression effect runs.
  Object.defineProperty(track, "applyConstraints", {
    value: () => Promise.resolve(),
  });
  const output = context.createGain();
  let source: MediaStreamAudioSourceNode | null = null;
  return {
    input,
    track,
    output,
    attach(processed) {
      source?.disconnect();
      source = context.createMediaStreamSource(new MediaStream([processed]));
      source.connect(output);
    },
    dispose() {
      input.disconnect();
      source?.disconnect();
      output.disconnect();
      track.stop();
    },
  };
}
