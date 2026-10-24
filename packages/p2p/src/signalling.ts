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
  /** Messages were malformed, from no user of the world, or too many: once per window. */
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

/** One sender's messages in the current fixed window. */
interface Tally {
  readonly start: number;
  readonly count: number;
  readonly reported: boolean;
}

/**
 * Counts per sender in fixed windows: constant work per message, however
 * many arrive, and each sender's drops are reported once per window.
 */
function createRateLimit(
  now: () => number,
  onDropped: (user: ParticipantId) => void,
) {
  let tallies = new Map<ParticipantId, Tally>();
  const current = (user: ParticipantId): Tally => {
    const tally = tallies.get(user);
    const fresh = !tally || now() - tally.start >= RATE_LIMIT.windowMs;
    return fresh ? { start: now(), count: 0, reported: false } : tally;
  };
  return {
    allow(user: ParticipantId): boolean {
      const tally = current(user);
      const next = { ...tally, count: tally.count + 1 };
      tallies = new Map(tallies).set(user, next);
      return next.count <= RATE_LIMIT.messages;
    },
    drop(user: ParticipantId): void {
      const tally = current(user);
      if (tally.reported) return;
      tallies = new Map(tallies).set(user, { ...tally, reported: true });
      onDropped(user);
    },
  };
}

export function createSignalling(deps: SignallingDeps): Signalling {
  const limit = createRateLimit(deps.now, deps.onDropped);

  const accept = (data: unknown, user: ParticipantId): Signal | null => {
    if (!deps.isUser(user) || !limit.allow(user)) {
      limit.drop(user);
      return null;
    }
    const signal = parseSignal(data);
    if (!signal) {
      limit.drop(user);
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
