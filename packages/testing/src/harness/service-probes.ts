/** Measures what a player would actually hear and see from a remote track. */

let context: AudioContext | null = null;

const NO_FRAME_MS = 2_000;

/**
 * Chrome only feeds remote WebRTC audio into Web Audio while an element
 * plays it, so the track is also attached to a muted element.
 */
export async function peakLevel(
  track: MediaStreamTrack,
  ms: number,
): Promise<number> {
  const stream = new MediaStream([track]);
  const element = new Audio();
  element.muted = true;
  element.srcObject = stream;
  await element.play().catch(() => undefined);
  context ??= new AudioContext();
  await context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let peak = 0;
  const end = performance.now() + ms;
  while (performance.now() < end) {
    analyser.getFloatTimeDomainData(samples);
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  source.disconnect();
  element.srcObject = null;
  return peak;
}

/** Mean luminance (0-255) of the next frame; 0 if none comes. */
export async function meanLuminance(track: MediaStreamTrack): Promise<number> {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = new MediaStream([track]);
  await video.play().catch(() => undefined);
  // No new frame (a muted track the server stops forwarding) shows nothing.
  const framed = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, NO_FRAME_MS);
    video.requestVideoFrameCallback(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!framed) {
    video.srcObject = null;
    return 0;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4)
    sum +=
      0.299 * (data[i] ?? 0) +
      0.587 * (data[i + 1] ?? 0) +
      0.114 * (data[i + 2] ?? 0);
  video.srcObject = null;
  return sum / (data.length / 4);
}
