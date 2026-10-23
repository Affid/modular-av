import type { Channel } from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import type { FoundrySocket } from "./foundry/globals.ts";

/** Needs `"socket": true` in the core's module.json. */
export const SOCKET_EVENT = `module.${MODULE_ID}`;

const CHANNEL_NAME = /^[a-z0-9][a-z0-9.:-]{0,63}$/;

type Handler = (data: unknown, senderId: string) => void;

/** A wrapper per registration, so each `on` undoes only itself. */
interface Registration {
  readonly handler: Handler;
}

interface Envelope {
  readonly channel: string;
  readonly data: unknown;
}

const isEnvelope = (value: unknown): value is Envelope =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { channel?: unknown }).channel === "string" &&
  "data" in value;

export interface Channels {
  channel(name: string): Channel;
}

/**
 * One Foundry socket event shared by every module through named channels,
 * so plugins don't each need `"socket": true`.
 */
export function createChannels(
  socket: FoundrySocket,
  onError: (error: unknown) => void,
): Channels {
  let handlers = new Map<string, readonly Registration[]>();

  socket.on(SOCKET_EVENT, (message, senderId) => {
    if (!isEnvelope(message) || typeof senderId !== "string") return;
    for (const { handler } of handlers.get(message.channel) ?? []) {
      try {
        handler(message.data, senderId);
      } catch (error: unknown) {
        onError(error);
      }
    }
  });

  return {
    channel(name) {
      if (!CHANNEL_NAME.test(name))
        throw new Error(`Invalid socket channel name "${name}"`);
      return Object.freeze({
        send(
          data: unknown,
          options?: { readonly recipients?: readonly string[] },
        ) {
          const envelope: Envelope = { channel: name, data };
          if (options?.recipients)
            socket.emit(SOCKET_EVENT, envelope, {
              recipients: options.recipients,
            });
          else socket.emit(SOCKET_EVENT, envelope);
        },
        on(handler: Handler) {
          const registration: Registration = { handler };
          handlers = new Map(handlers).set(name, [
            ...(handlers.get(name) ?? []),
            registration,
          ]);
          return () => {
            handlers = new Map(handlers).set(
              name,
              (handlers.get(name) ?? []).filter((r) => r !== registration),
            );
          };
        },
      });
    },
  };
}

const SAFE_SEGMENT = /^[\w.-]+$/;

/** A module file's URL through Foundry's route prefix. */
export function assetUrl(
  getRoute: (path: string) => string,
  moduleId: string,
  path: string,
): string {
  const segments = path.split("/");
  const safe =
    SAFE_SEGMENT.test(moduleId) &&
    segments.every((s) => SAFE_SEGMENT.test(s) && s !== "." && s !== "..");
  if (!safe) throw new Error(`Invalid module asset "${moduleId}/${path}"`);
  return getRoute(`modules/${moduleId}/${path}`);
}
