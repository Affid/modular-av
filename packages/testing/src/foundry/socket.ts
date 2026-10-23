/**
 * Handlers get the sender's user id, which Foundry's server takes from the
 * sender's session (v14 dist/server/sockets.mjs `handleCustomSocket`), so a
 * GM's client can trust it. Handlers may be async, as real ones are.
 */
export type SocketHandler = (data: unknown, senderId: string) => unknown;

export interface EmitOptions {
  /** Deliver only to these users' clients (Foundry's `recipients`). */
  readonly recipients?: readonly string[];
}

export interface FakeSocket {
  /** To every other client, or with `recipients` to those users' clients. */
  emit(event: string, data: unknown, options?: EmitOptions): void;
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
  readonly recipients: readonly string[] | undefined;
}

export interface SocketNetwork {
  attach(userId: string): {
    readonly socket: FakeSocket;
    readonly detach: () => void;
  };
  /**
   * Resolves once queued messages, and the replies handlers send after
   * awaiting promises, are delivered. Handlers waiting on timers are not
   * covered: advance or await those in the test.
   */
  settle(): Promise<void>;
  readonly errors: readonly unknown[];
}

/** Microtask turns per settle round: enough for a few awaits in a handler. */
const SETTLE_TURNS = 20;

const reaches = (message: Message, id: number, endpoint: Endpoint): boolean =>
  message.recipients
    ? message.recipients.includes(endpoint.userId)
    : id !== message.from;

export function createSocketNetwork(): SocketNetwork {
  let nextEndpoint = 1;
  let endpoints = new Map<number, Endpoint>();
  let queue: readonly Message[] = [];
  let sent = 0;
  let errors: readonly unknown[] = [];

  const record = (error: unknown): void => {
    errors = [...errors, error];
  };

  const deliver = (message: Message): void => {
    for (const [id, endpoint] of endpoints) {
      if (!reaches(message, id, endpoint)) continue;
      for (const handler of endpoint.handlers.get(message.event) ?? []) {
        try {
          const result = handler(
            structuredClone(message.data),
            message.senderId,
          );
          if (result instanceof Promise) result.catch(record);
        } catch (error: unknown) {
          record(error);
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
        emit(event, data, options) {
          if (!endpoints.has(id)) throw new Error("The socket is disconnected");
          const message = {
            from: id,
            senderId: userId,
            event,
            data: structuredClone(data),
            recipients: options?.recipients,
          };
          queue = [...queue, message];
          sent += 1;
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
      let before: number;
      do {
        before = sent;
        flush();
        for (let turn = 0; turn < SETTLE_TURNS; turn += 1)
          await Promise.resolve();
      } while (queue.length > 0 || sent !== before);
    },

    get errors() {
      return errors;
    },
  };
}
