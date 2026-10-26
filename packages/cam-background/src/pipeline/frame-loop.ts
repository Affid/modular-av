/** A frame the loop reads; it closes each one once processed. */
export interface Closable {
  close(): void;
}

export interface FrameLoop<F> {
  /** A camera restart: read from this instead. */
  setInput(input: ReadableStream<F>): void;
  /** Stops reading; resolves once the frame in hand is done. */
  stop(): Promise<void>;
}

interface LoopState<F> {
  reader: ReadableStreamDefaultReader<F>;
  stopped: boolean;
  inputChanged: () => void;
}

/** The next read; done (not an error) if the input was replaced meanwhile. */
async function read<F>(
  state: LoopState<F>,
  current: ReadableStreamDefaultReader<F>,
): Promise<ReadableStreamReadResult<F>> {
  try {
    return await current.read();
  } catch (error: unknown) {
    if (current !== state.reader || state.stopped)
      return { done: true, value: undefined };
    throw error;
  }
}

/** The camera's stream ended: resolves when another is given. */
const nextInput = <F>(state: LoopState<F>): Promise<void> =>
  new Promise((resolve) => {
    state.inputChanged = resolve;
  });

// Reads `stopped` through a function: it changes while a read is pending.
const running = <F>(state: LoopState<F>): boolean => !state.stopped;

async function loop<F extends Closable>(
  state: LoopState<F>,
  process: (frame: F) => Promise<void>,
): Promise<void> {
  while (running(state)) {
    const current = state.reader;
    const result = await read(state, current);
    if (result.done) {
      if (current === state.reader && running(state)) await nextInput(state);
      continue;
    }
    try {
      if (running(state)) await process(result.value);
    } finally {
      result.value.close();
    }
  }
}

/**
 * Reads frames one at a time and hands each to `process`, closing it after;
 * when the camera's stream ends it waits for the next one. `onError` gets
 * the first failure, after which nothing more is read.
 */
export function startFrameLoop<F extends Closable>(
  input: ReadableStream<F>,
  process: (frame: F) => Promise<void>,
  onError: (error: unknown) => void,
): FrameLoop<F> {
  const state: LoopState<F> = {
    reader: input.getReader(),
    stopped: false,
    inputChanged: () => undefined,
  };
  const done = loop(state, process).catch((error: unknown) => {
    if (!running(state)) return;
    state.stopped = true;
    onError(error);
  });
  return {
    setInput(next) {
      const old = state.reader;
      state.reader = next.getReader();
      old.cancel().catch(() => undefined);
      state.inputChanged();
    },
    async stop() {
      state.stopped = true;
      state.inputChanged();
      await state.reader.cancel().catch(() => undefined);
      await done;
    },
  };
}
