import type { Channel } from "@modular-av/api";

/**
 * The core's socket channel as Foundry delivers it, a task later and in
 * order: without `recipients` to every other tab (the sender's own other
 * tabs too), with them to every tab of those users, the sender's included.
 */
export interface ChannelHub {
  endpoint(user: string): { readonly channel: Channel; detach(): void };
  /** Messages sent so far, in order, with their sender. */
  readonly sent: readonly { readonly user: string; readonly data: unknown }[];
  /** While true, nothing is delivered (and nothing is kept). */
  paused: boolean;
}

interface Endpoint {
  readonly user: string;
  readonly handlers: readonly ((data: unknown, sender: string) => void)[];
}

export function createChannelHub(): ChannelHub {
  let endpoints = new Map<number, Endpoint>();
  let next = 1;
  const hub: ChannelHub = {
    sent: [],
    paused: false,
    endpoint(user) {
      const id = next++;
      endpoints = new Map(endpoints).set(id, { user, handlers: [] });
      const channel: Channel = {
        send(data, options) {
          (hub.sent as { user: string; data: unknown }[]).push({ user, data });
          if (hub.paused) return;
          const copy = structuredClone(data);
          const targets = [...endpoints].filter(([other, e]) =>
            options?.recipients
              ? options.recipients.includes(e.user)
              : other !== id,
          );
          setTimeout(() => {
            for (const [other] of targets)
              for (const handler of endpoints.get(other)?.handlers ?? [])
                handler(structuredClone(copy), user);
          }, 0);
        },
        on(handler) {
          const current = endpoints.get(id);
          if (current)
            endpoints = new Map(endpoints).set(id, {
              ...current,
              handlers: [...current.handlers, handler],
            });
          return () => {
            const now = endpoints.get(id);
            if (now)
              endpoints = new Map(endpoints).set(id, {
                ...now,
                handlers: now.handlers.filter((h) => h !== handler),
              });
          };
        },
      };
      return {
        channel,
        detach() {
          const rest = new Map(endpoints);
          rest.delete(id);
          endpoints = rest;
        },
      };
    },
  };
  return hub;
}
