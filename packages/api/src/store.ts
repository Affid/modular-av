/**
 * An observable value. Listeners run in a microtask after a change, once
 * per batch of changes, and only when their selected slice changed.
 */
export interface Store<T> {
  get(): T;
  subscribe<S>(
    selector: (state: T) => S,
    listener: (value: S, previous: S) => void,
    options?: SubscribeOptions<S>,
  ): () => void;
}

export interface SubscribeOptions<S> {
  /** Defaults to `Object.is`. */
  readonly equals?: (a: S, b: S) => boolean;
}
