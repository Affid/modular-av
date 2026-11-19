import type { ParticipantId } from "@modular-av/api";
import type { JitsiParticipant } from "./sdk-types.ts";

/** Someone newly present, and the older endpoints of theirs they replace. */
export interface Joined {
  readonly id: ParticipantId;
  readonly replaced: readonly string[];
}

/**
 * Who a participant is. `joinedAt` (open servers: when their page first
 * joined, by its clock) orders a user's endpoints; without it the one
 * seen last is the newest.
 */
export interface Identity {
  readonly id: ParticipantId;
  readonly joinedAt?: number;
}

/**
 * Who is in the room, by bridge endpoint: only participants someone
 * vouched for, one endpoint per Foundry user. A newer endpoint replaces
 * an older one, as the core's "newer tab wins": a player who reloads
 * stays in the room a while (the server keeps the old session for
 * resumption), and the older tab ends itself.
 */
export interface Roster {
  /** Who is newly present, or null (known, ignored, unknown, or ours). */
  join(endpoint: string, participant: JitsiParticipant): Joined | null;
  /** A Foundry user now gone, or null. */
  leave(endpoint: string): ParticipantId | null;
  idOf(endpoint: string): ParticipantId | undefined;
  endpointOf(participant: ParticipantId): string | undefined;
  /** Placed: shown, or ignored as an older tab. */
  knows(endpoint: string): boolean;
  /** From now on another endpoint of ours is a newer tab (no `joinedAt`). */
  start(): void;
}

export interface RosterHooks {
  readonly self: ParticipantId;
  /** Our own page's join time, when identities carry theirs. */
  readonly joinedAt?: number;
  /** Our own endpoint, to break a tie between join times. */
  readonly selfEndpoint: () => string;
  /** Who vouches: the server (tokens) or the binding (open servers). */
  readonly identify: (
    endpoint: string,
    participant: JitsiParticipant,
  ) => Identity | null;
  /** A participant nobody vouches for (yet), once each. */
  readonly onUnvouched: (endpoint: string) => void;
  /** The same Foundry user joined again elsewhere: this one is older. */
  readonly onDuplicate: () => void;
}

interface Placed {
  readonly endpoint: string;
  readonly identity: Identity;
}

/** The later join wins; the larger endpoint breaks a tie (as P2P). */
const isNewer = (a: Placed, b: Placed): boolean => {
  const at = a.identity.joinedAt ?? 0;
  const bt = b.identity.joinedAt ?? 0;
  return at !== bt ? at > bt : a.endpoint > b.endpoint;
};

export function createRoster(hooks: RosterHooks): Roster {
  let endpoints = new Map<string, Identity>();
  let unvouched: ReadonlySet<string> = new Set();
  /** Older tabs, ours or replaced ones: never shown again. */
  let ignored: ReadonlySet<string> = new Set();
  let started = false;

  const ignore = (endpoint: string): null => {
    ignored = new Set(ignored).add(endpoint);
    return null;
  };

  /**
   * Our own identity elsewhere. Ordered by join time when there is one.
   * Else one already there when we joined is the older tab and leaves (or
   * has closed, and the server keeps its session a while). Known limit: a
   * tab that joins while we are still joining counts as older too, and
   * both stay.
   */
  const ours = (placed: Placed): null => {
    if (
      placed.identity.joinedAt !== undefined &&
      hooks.joinedAt !== undefined
    ) {
      const self = {
        endpoint: hooks.selfEndpoint(),
        identity: { id: hooks.self, joinedAt: hooks.joinedAt },
      };
      if (!isNewer(placed, self)) return ignore(placed.endpoint);
      hooks.onDuplicate();
      return null;
    }
    if (started) hooks.onDuplicate();
    else ignore(placed.endpoint);
    return null;
  };

  const place = (placed: Placed): Joined | null => {
    const { endpoint, identity } = placed;
    const same = [...endpoints]
      .filter(([, known]) => known.id === identity.id)
      .map(([old, known]) => ({ endpoint: old, identity: known }));
    const ordered = identity.joinedAt !== undefined;
    if (ordered && same.some((known) => isNewer(known, placed)))
      return ignore(endpoint);
    const replaced = same.map((known) => known.endpoint);
    ignored = new Set([...ignored, ...replaced]);
    endpoints = new Map(
      [...endpoints].filter(([old]) => !replaced.includes(old)),
    ).set(endpoint, identity);
    return { id: identity.id, replaced };
  };

  return {
    join(endpoint, participant) {
      if (endpoints.has(endpoint) || ignored.has(endpoint)) return null;
      const identity = hooks.identify(endpoint, participant);
      if (!identity) {
        if (!unvouched.has(endpoint)) hooks.onUnvouched(endpoint);
        unvouched = new Set(unvouched).add(endpoint);
        return null;
      }
      const placed = { endpoint, identity };
      return identity.id === hooks.self ? ours(placed) : place(placed);
    },
    leave(endpoint) {
      const identity = endpoints.get(endpoint);
      if (!identity) return null;
      const rest = new Map(endpoints);
      rest.delete(endpoint);
      endpoints = rest;
      return identity.id;
    },
    idOf: (endpoint) => endpoints.get(endpoint)?.id,
    endpointOf: (participant) =>
      [...endpoints].find(([, identity]) => identity.id === participant)?.[0],
    knows: (endpoint) => endpoints.has(endpoint) || ignored.has(endpoint),
    start() {
      started = true;
    },
  };
}
