import type { ServiceEvents } from "@modular-av/api";

type Handler = (...args: never[]) => void;

export interface Emitter {
  on<E extends keyof ServiceEvents>(
    event: E,
    handler: ServiceEvents[E],
  ): () => void;
  emit<E extends keyof ServiceEvents>(
    event: E,
    ...args: Parameters<ServiceEvents[E]>
  ): void;
}

/** The connection's events; a throwing handler goes to `onError`. */
export function createEmitter(onError: (error: unknown) => void): Emitter {
  let handlers = new Map<keyof ServiceEvents, readonly { fn: Handler }[]>();
  return {
    on(event, handler) {
      const entry: { fn: Handler } = { fn: handler };
      handlers = new Map(handlers).set(event, [
        ...(handlers.get(event) ?? []),
        entry,
      ]);
      return () => {
        handlers = new Map(handlers).set(
          event,
          (handlers.get(event) ?? []).filter((e) => e !== entry),
        );
      };
    },
    emit(event, ...args) {
      for (const { fn } of handlers.get(event) ?? []) {
        try {
          (fn as (...a: typeof args) => void)(...args);
        } catch (error: unknown) {
          onError(error);
        }
      }
    },
  };
}
