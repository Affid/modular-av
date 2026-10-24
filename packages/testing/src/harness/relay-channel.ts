import type { Channel } from "@modular-av/api";

type Handler = (data: unknown, senderId: string) => void;

interface Relayed {
  readonly sender: string;
  readonly data: unknown;
}

/**
 * A `Channel` over the harness's signal relay, as one user in one space.
 * Sends go out one at a time, so they arrive in order, as on Foundry's
 * socket; those made before the stream opened wait for it.
 */
export function createRelayChannel(user: string, space: string): Channel {
  let handlers: readonly { readonly handler: Handler }[] = [];
  let endpoint: Promise<number> | null = null;
  let queue: Promise<void> = Promise.resolve();

  const connect = (): Promise<number> =>
    (endpoint ??= new Promise((resolve) => {
      const query = new URLSearchParams({ user, space });
      const source = new EventSource(`/signal/events?${query.toString()}`);
      source.addEventListener("endpoint", (event) => {
        resolve(Number((event as MessageEvent<string>).data));
      });
      source.addEventListener("message", (event) => {
        const relayed = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as Relayed;
        for (const { handler } of handlers)
          handler(relayed.data, relayed.sender);
      });
    }));

  return {
    send(data, options) {
      queue = queue
        .then(async () => {
          const body = JSON.stringify({
            endpoint: await connect(),
            data,
            ...(options?.recipients ? { recipients: options.recipients } : {}),
          });
          await fetch("/signal/send", { method: "POST", body });
        })
        .catch((error: unknown) => {
          // eslint-disable-next-line no-console -- surfaces in Playwright's page log
          console.error("signal relay", error);
        });
    },
    on(handler) {
      void connect();
      const registration = { handler };
      handlers = [...handlers, registration];
      return () => {
        handlers = handlers.filter((r) => r !== registration);
      };
    },
  };
}
