import type { Store, SubscribeOptions } from "@modular-av/api";

export interface WritableStore<T> extends Store<T> {
  /** Applies at once; listeners run once per batch, in a microtask. */
  update(change: (state: T) => T): void;
  /** What the public API exposes. */
  readonly view: Store<T>;
}

interface Subscription<T> {
  readonly select: (state: T) => unknown;
  readonly listener: (value: unknown, previous: unknown) => void;
  readonly equals: (a: unknown, b: unknown) => boolean;
  last: unknown;
}

/**
 * A microtask batches changes rather than an animation frame: hidden tabs
 * pause frames, and a mute must show at once.
 */
export function createStore<T>(
  initial: T,
  onError: (error: unknown) => void = () => undefined,
): WritableStore<T> {
  let state = initial;
  let subscriptions: readonly Subscription<T>[] = [];
  let scheduled = false;

  const notify = (): void => {
    scheduled = false;
    for (const sub of subscriptions) {
      const value = sub.select(state);
      if (sub.equals(value, sub.last)) continue;
      const previous = sub.last;
      sub.last = value;
      try {
        sub.listener(value, previous);
      } catch (error: unknown) {
        onError(error);
      }
    }
  };

  const view: Store<T> = Object.freeze({
    get: () => state,
    subscribe<S>(
      selector: (state: T) => S,
      listener: (value: S, previous: S) => void,
      options?: SubscribeOptions<S>,
    ): () => void {
      const sub: Subscription<T> = {
        select: selector,
        listener: listener as (value: unknown, previous: unknown) => void,
        equals: (options?.equals ?? Object.is) as (
          a: unknown,
          b: unknown,
        ) => boolean,
        last: selector(state),
      };
      subscriptions = [...subscriptions, sub];
      return () => {
        subscriptions = subscriptions.filter((s) => s !== sub);
      };
    },
  });

  return {
    get: () => state,
    subscribe: (selector, listener, options) =>
      view.subscribe(selector, listener, options),
    update(change) {
      state = change(state);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(notify);
    },
    view,
  };
}
