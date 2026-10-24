import type { Channel, ParticipantId } from "@modular-av/api";
import { parseSignal, PROTOCOL, type Signal } from "./messages.ts";

/** Messages one user may send per window; ICE trickles a few dozen per link. */
export const RATE_LIMIT = { messages: 200, windowMs: 10_000 } as const;

/** A message without what the signalling adds: version, room, sender. */
export type SignalBody<S = Signal> = S extends Signal
  ? Omit<S, "v" | "room" | "from">
  : never;

export interface SignallingDeps {
  readonly channel: Channel;
  readonly room: string;
  /** This connection's session id. */
  readonly session: string;
  /** A user of this world: Foundry's server named the sender. */
  readonly isUser: (user: ParticipantId) => boolean;
  readonly now: () => number;
  /** A message was malformed, from no user of the world, or one too many. */
  readonly onDropped: (user: ParticipantId) => void;
}

export interface Signalling {
  /** To every other tab in the world. */
  broadcast(body: SignalBody): void;
  /** To every tab of `user`; `to` in the body picks the session. */
  send(user: ParticipantId, body: SignalBody): void;
  /** Only well-formed messages for this room and session reach `handler`. */
  listen(handler: (signal: Signal, user: ParticipantId) => void): () => void;
}

export function createSignalling(deps: SignallingDeps): Signalling {
  let recent = new Map<ParticipantId, readonly number[]>();

  const allow = (user: ParticipantId): boolean => {
    const since = deps.now() - RATE_LIMIT.windowMs;
    const times = (recent.get(user) ?? []).filter((t) => t > since);
    recent = new Map(recent).set(user, [...times, deps.now()]);
    if (times.length < RATE_LIMIT.messages) return true;
    // Said once per window, not for every message past the limit.
    if (times.length === RATE_LIMIT.messages) deps.onDropped(user);
    return false;
  };

  const accept = (data: unknown, user: ParticipantId): Signal | null => {
    if (!deps.isUser(user)) {
      deps.onDropped(user);
      return null;
    }
    if (!allow(user)) return null;
    const signal = parseSignal(data);
    if (!signal) {
      deps.onDropped(user);
      return null;
    }
    const elsewhere = signal.room !== deps.room || signal.from === deps.session;
    if (elsewhere || ("to" in signal && signal.to !== deps.session))
      return null;
    return signal;
  };

  const envelope = (body: SignalBody): unknown => ({
    v: PROTOCOL,
    room: deps.room,
    from: deps.session,
    ...body,
  });

  return {
    broadcast(body) {
      deps.channel.send(envelope(body));
    },
    send(user, body) {
      deps.channel.send(envelope(body), { recipients: [user] });
    },
    listen(handler) {
      return deps.channel.on((data, user) => {
        const signal = accept(data, user);
        if (signal) handler(signal, user);
      });
    },
  };
}
