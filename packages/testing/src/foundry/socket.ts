/**
 * Handlers get the sender's user id, which Foundry's server authenticates.
 * The handoff relies on this for the GM token relay; milestone 2 checks it
 * against real Foundry v14 before anything depends on it.
 */
export type SocketHandler = (data: unknown, senderId: string) => void;

export interface FakeSocket {
  /** Delivered to every other connected client, never back to the sender. */
  emit(event: string, data: unknown): void;
  on(event: string, handler: SocketHandler): void;
  off(event: string, handler: SocketHandler): void;
}

interface Endpoint {
  readonly userId: string;
  readonly handlers: ReadonlyMap<string, readonly SocketHandler[]>;
}

interface Message {
  readonly from: number;
  readonly senderId: string;
  readonly event: string;
  readonly data: unknown;
}

export interface SocketNetwork {
  attach(userId: string): {
    readonly socket: FakeSocket;
    readonly detach: () => void;
  };
  /** Resolves once every queued message, and any they caused, is delivered. */
  settle(): Promise<void>;
  readonly errors: readonly unknown[];
}

export function createSocketNetwork(): SocketNetwork {
  let nextEndpoint = 1;
  let endpoints = new Map<number, Endpoint>();
  let queue: readonly Message[] = [];
  let errors: readonly unknown[] = [];

  const deliver = (message: Message): void => {
    for (const [id, endpoint] of endpoints) {
      if (id === message.from) continue;
      for (const handler of endpoint.handlers.get(message.event) ?? []) {
        try {
          handler(structuredClone(message.data), message.senderId);
        } catch (error: unknown) {
          errors = [...errors, error];
        }
      }
    }
  };

  const flush = (): void => {
    while (queue.length > 0) {
      const [message, ...rest] = queue;
      queue = rest;
      if (message) deliver(message);
    }
  };

  const updateHandlers = (
    id: number,
    event: string,
    change: (current: readonly SocketHandler[]) => readonly SocketHandler[],
  ): void => {
    const endpoint = endpoints.get(id);
    if (!endpoint) return;
    const handlers = new Map(endpoint.handlers).set(
      event,
      change(endpoint.handlers.get(event) ?? []),
    );
    endpoints = new Map(endpoints).set(id, { ...endpoint, handlers });
  };

  return {
    attach(userId) {
      const id = nextEndpoint++;
      endpoints = new Map(endpoints).set(id, { userId, handlers: new Map() });
      const socket: FakeSocket = {
        emit(event, data) {
          if (!endpoints.has(id)) return;
          queue = [
            ...queue,
            { from: id, senderId: userId, event, data: structuredClone(data) },
          ];
          queueMicrotask(flush);
        },
        on(event, handler) {
          updateHandlers(id, event, (current) => [...current, handler]);
        },
        off(event, handler) {
          updateHandlers(id, event, (current) =>
            current.filter((h) => h !== handler),
          );
        },
      };
      const detach = (): void => {
        const remaining = new Map(endpoints);
        remaining.delete(id);
        endpoints = remaining;
      };
      return { socket, detach };
    },

    async settle() {
      do {
        flush();
        await Promise.resolve();
      } while (queue.length > 0);
    },

    get errors() {
      return errors;
    },
  };
}
