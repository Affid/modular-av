/**
 * Tracks made the way the core makes its final tracks, for the service
 * contract: the microphone through a 48 kHz Web Audio graph (as the gate
 * and noise models run), the camera through a MediaStreamTrackGenerator
 * (as a video effect's output). A service must carry these, not only
 * tracks straight from getUserMedia.
 */

/** The parts of the insertable streams API (Chromium) used here. */
type Processor = new (init: { track: MediaStreamTrack }) => {
  readonly readable: ReadableStream<unknown>;
};
type Generator = new (init: { kind: "video" }) => MediaStreamTrack & {
  readonly writable: WritableStream<unknown>;
};
const insertable = globalThis as unknown as {
  MediaStreamTrackProcessor: Processor;
  MediaStreamTrackGenerator: Generator;
};

let context: AudioContext | null = null;

export async function coreMicrophone(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  context ??= new AudioContext({ sampleRate: 48_000 });
  await context.resume();
  const destination = context.createMediaStreamDestination();
  const gain = context.createGain();
  context.createMediaStreamSource(stream).connect(gain).connect(destination);
  const [track] = destination.stream.getAudioTracks();
  if (!track) throw new Error("No Web Audio track");
  return track;
}

export async function coreCamera(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const [camera] = stream.getVideoTracks();
  if (!camera) throw new Error("No camera");
  const processor = new insertable.MediaStreamTrackProcessor({ track: camera });
  const generator = new insertable.MediaStreamTrackGenerator({ kind: "video" });
  void processor.readable.pipeTo(generator.writable).catch(() => undefined);
  return generator;
}
