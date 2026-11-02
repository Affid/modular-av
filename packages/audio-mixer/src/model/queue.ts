type Task = () => Promise<unknown>;

interface Waiting {
  readonly key: string;
  readonly task: Task;
  readonly done: Promise<void>;
  readonly finish: () => void;
}

export interface Writer {
  /**
   * Runs `task` after every write before it. A write of `key` still waiting is
   * replaced where it stands, so a dragged slider or fast preset switching
   * lands on the last value without replaying the ones between.
   */
  run(key: string, task: Task): Promise<void>;
  /** Hears each failed write, as long as it listens. */
  onFailure(listener: (error: unknown) => void): () => void;
}

/** Every write from the module goes through one of these. */
export function createWriter(onError: (error: unknown) => void): Writer {
  let waiting: readonly Waiting[] = [];
  let draining = false;
  let listeners: readonly ((error: unknown) => void)[] = [];

  /** Whoever hears a failure can't stop the writes behind it. */
  const report = (error: unknown): void => {
    for (const listener of [onError, ...listeners]) {
      try {
        listener(error);
      } catch (thrown: unknown) {
        reportError(thrown);
      }
    }
  };

  const drain = async (): Promise<void> => {
    draining = true;
    for (let next = waiting[0]; next; next = waiting[0]) {
      waiting = waiting.slice(1);
      try {
        await next.task();
      } catch (error: unknown) {
        report(error);
      }
      next.finish();
    }
    draining = false;
  };

  return {
    run(key, task) {
      const known = waiting.find((w) => w.key === key);
      if (known) {
        waiting = waiting.map((w) => (w === known ? { ...w, task } : w));
        return known.done;
      }
      let finish = (): void => undefined;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      waiting = [...waiting, { key, task, done, finish }];
      if (!draining) void drain();
      return done;
    },
    onFailure(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
