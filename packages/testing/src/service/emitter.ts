type EventMap<T> = { [K in keyof T]: (...args: never[]) => void };

export interface Emitter<T extends EventMap<T>> {
  /** Returns a function that removes this registration only. */
  on<E extends keyof T>(event: E, handler: T[E]): () => void;
  emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>): void;
}

interface Registration<T> {
  readonly id: number;
  readonly handler: T[keyof T];
}

/** A typed emitter; a throwing handler goes to `onError`, the rest still run. */
export function createEmitter<T extends EventMap<T>>(
  onError: (error: unknown) => void,
): Emitter<T> {
  let nextId = 1;
  let registrations = new Map<keyof T, readonly Registration<T>[]>();

  return {
    on(event, handler) {
      const id = nextId++;
      registrations = new Map(registrations).set(event, [
        ...(registrations.get(event) ?? []),
        { id, handler },
      ]);
      return () => {
        const remaining = (registrations.get(event) ?? []).filter(
          (r) => r.id !== id,
        );
        registrations = new Map(registrations).set(event, remaining);
      };
    },
    emit(event, ...args) {
      for (const { handler } of registrations.get(event) ?? []) {
        try {
          (handler as (...a: Parameters<T[typeof event]>) => void)(...args);
        } catch (error: unknown) {
          onError(error);
        }
      }
    },
  };
}
