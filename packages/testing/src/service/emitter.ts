type EventMap<T> = { [K in keyof T]: (...args: never[]) => void };

export interface Emitter<T extends EventMap<T>> {
  on<E extends keyof T>(event: E, handler: T[E]): () => void;
  emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>): void;
}

export function createEmitter<T extends EventMap<T>>(): Emitter<T> {
  let handlers = new Map<keyof T, readonly T[keyof T][]>();

  return {
    on(event, handler) {
      handlers = new Map(handlers).set(event, [
        ...(handlers.get(event) ?? []),
        handler,
      ]);
      return () => {
        const remaining = (handlers.get(event) ?? []).filter(
          (h) => h !== handler,
        );
        handlers = new Map(handlers).set(event, remaining);
      };
    },
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) {
        (handler as (...a: Parameters<T[typeof event]>) => void)(...args);
      }
    },
  };
}
