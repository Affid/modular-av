/** How long "Test my voice" records. */
export const RECORD_MS = 5_000;

export type VoiceTestStep =
  "idle" | "recording" | "playing" | "no-microphone" | "failed";

/** The browser's part: a fake in tests. */
export interface Recording {
  record(stream: MediaStream, ms: number, signal: AbortSignal): Promise<Blob>;
  play(sound: Blob, signal: AbortSignal): Promise<void>;
}

export interface VoiceTest {
  /** Stops a test running, then starts anew. */
  start(): Promise<void>;
  stop(): void;
}

/**
 * Records what would be sent and plays it back afterwards, so it needs no headphones
 * and can't feed back. The copy of the voice stops as soon as it is recorded.
 */
export function createVoiceTest(
  voice: () => MediaStream | null,
  recording: Recording,
  onStep: (step: VoiceTestStep) => void,
): VoiceTest {
  let running: AbortController | null = null;

  const stop = (): void => {
    running?.abort();
    running = null;
  };

  const capture = async (
    stream: MediaStream,
    signal: AbortSignal,
  ): Promise<Blob> => {
    try {
      return await recording.record(stream, RECORD_MS, signal);
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  };

  return {
    stop,
    async start() {
      stop();
      const stream = voice();
      if (!stream) {
        onStep("no-microphone");
        return;
      }
      const test = new AbortController();
      running = test;
      const { signal } = test;
      const stopped = (): boolean => signal.aborted;
      try {
        onStep("recording");
        const sound = await capture(stream, signal);
        if (stopped()) return;
        onStep("playing");
        await recording.play(sound, signal);
        if (!stopped()) onStep("idle");
      } catch (error: unknown) {
        if (stopped()) return;
        onStep("failed");
        throw error;
      }
    },
  };
}

/** Until `ms` passed or `signal` aborted, then whatever was recorded. */
function browserRecord(
  stream: MediaStream,
  ms: number,
  signal: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      if (recorder.state !== "inactive") recorder.stop();
    };
    const timer = setTimeout(finish, ms);
    recorder.ondataavailable = (event) => {
      chunks.push(event.data);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Recording failed: ${event.type}`));
    };
    signal.addEventListener("abort", finish, { once: true });
    recorder.start();
  });
}

function browserPlay(sound: Blob, signal: AbortSignal): Promise<void> {
  const url = URL.createObjectURL(sound);
  const audio = new Audio(url);
  return new Promise<void>((resolve, reject) => {
    const stop = (): void => {
      audio.pause();
      resolve();
    };
    audio.onended = stop;
    audio.onerror = () => {
      reject(new Error("The recording couldn't be played"));
    };
    signal.addEventListener("abort", stop, { once: true });
    audio.play().catch(reject);
  }).finally(() => {
    URL.revokeObjectURL(url);
  });
}

export const BROWSER_RECORDING: Recording = {
  record: browserRecord,
  play: browserPlay,
};
