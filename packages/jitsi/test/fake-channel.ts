import type { Channel } from "@modular-av/api";

type Handler = (data: unknown, senderId: string) => void;

export interface Sent {
  readonly from: string;
  readonly data: unknown;
  readonly recipients?: readonly string[];
}

export interface FakeHub {
  /** A client of `user`, on the core's channel: Foundry names the sender. */
  channel(user: string): Channel;
  /** A message as if `from` sent it, to everyone (or `recipients`). */
  inject(from: string, data: unknown, recipients?: readonly string[]): void;
  readonly sent: readonly Sent[];
}

interface Client {
  readonly id: number;
  readonly user: string;
}

/**
 * Foundry's socket for unit tests: a message reaches every other client
 * (or the recipients' clients) a moment later, stamped with its sender.
 */
export function createHub(): FakeHub {
  let clients: readonly Client[] = [];
  let handlers: ReadonlyMap<number, readonly Handler[]> = new Map();
  let sent: readonly Sent[] = [];

  const deliver = (
    from: string,
    data: unknown,
    origin: number | null,
    recipients?: readonly string[],
  ): void => {
    sent = [...sent, recipients ? { from, data, recipients } : { from, data }];
    const targets = clients.filter(
      (c) => c.id !== origin && (!recipients || recipients.includes(c.user)),
    );
    queueMicrotask(() => {
      for (const target of targets)
        for (const handler of handlers.get(target.id) ?? [])
          handler(data, from);
    });
  };

  return {
    channel(user) {
      const client: Client = { id: clients.length, user };
      clients = [...clients, client];
      return {
        send(data, options) {
          deliver(user, data, client.id, options?.recipients);
        },
        on(handler) {
          handlers = new Map(handlers).set(client.id, [
            ...(handlers.get(client.id) ?? []),
            handler,
          ]);
          return () => {
            handlers = new Map(handlers).set(
              client.id,
              (handlers.get(client.id) ?? []).filter((h) => h !== handler),
            );
          };
        },
      };
    },
    inject(from, data, recipients) {
      deliver(from, data, null, recipients);
    },
    get sent() {
      return sent;
    },
  };
}
