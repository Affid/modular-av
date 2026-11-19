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

const joinedAt = (placed: Placed): number => placed.identity.joinedAt ?? 0;

/**
 * Between our tabs: the later join wins; the larger endpoint breaks a tie
 * (as P2P), so both tabs agree on which one stays.
 */
const isNewer = (a: Placed, b: Placed): boolean =>
  joinedAt(a) !== joinedAt(b)
    ? joinedAt(a) > joinedAt(b)
    : a.endpoint > b.endpoint;

/**
 * Whether someone's endpoint shown now stays when another of theirs comes.
 * The same join time is the same page joining again (a reconnection),
 * while the server keeps its old endpoint a while: the new one wins.
 */
const outranks = (known: Placed, placed: Placed): boolean =>
  joinedAt(known) > joinedAt(placed);

/** Who the roster has placed, and what it has seen. */
interface RosterState {
  readonly endpoints: ReadonlyMap<string, Identity>;
  readonly unvouched: ReadonlySet<string>;
  /** Older tabs, ours or replaced ones: never shown again. */
  readonly ignored: ReadonlySet<string>;
  readonly started: boolean;
}

/** A join's outcome: the new state, and what the hooks are to hear. */
interface Step {
  readonly state: RosterState;
  readonly joined: Joined | null;
  readonly duplicate?: boolean;
  readonly unvouched?: boolean;
}

const ignore = (state: RosterState, endpoint: string): RosterState => ({
  ...state,
  ignored: new Set(state.ignored).add(endpoint),
});

/**
 * Our own identity elsewhere. Ordered by join time when there is one.
 * Else one already there when we joined is the older tab and leaves (or
 * has closed, and the server keeps its session a while). Known limit: a
 * tab that joins while we are still joining counts as older too, and
 * both stay.
 */
function ours(state: RosterState, placed: Placed, self: Placed): Step {
  if (
    placed.identity.joinedAt !== undefined &&
    self.identity.joinedAt !== undefined
  )
    return {
      state: ignore(state, placed.endpoint),
      joined: null,
      duplicate: isNewer(placed, self),
    };
  return state.started
    ? { state, joined: null, duplicate: true }
    : { state: ignore(state, placed.endpoint), joined: null };
}

/** Someone else's endpoint: shown, replacing their older ones, or ignored. */
function place(state: RosterState, placed: Placed): Step {
  const { endpoint, identity } = placed;
  const same = [...state.endpoints]
    .filter(([, known]) => known.id === identity.id)
    .map(([old, known]) => ({ endpoint: old, identity: known }));
  const ordered = identity.joinedAt !== undefined;
  if (ordered && same.some((known) => outranks(known, placed)))
    return { state: ignore(state, endpoint), joined: null };
  const replaced = same.map((known) => known.endpoint);
  const endpoints = new Map(
    [...state.endpoints].filter(([old]) => !replaced.includes(old)),
  ).set(endpoint, identity);
  return {
    state: {
      ...state,
      endpoints,
      ignored: new Set([...state.ignored, ...replaced]),
    },
    joined: { id: identity.id, replaced },
  };
}

function join(
  state: RosterState,
  hooks: RosterHooks,
  endpoint: string,
  participant: JitsiParticipant,
): Step {
  if (state.endpoints.has(endpoint) || state.ignored.has(endpoint))
    return { state, joined: null };
  const identity = hooks.identify(endpoint, participant);
  if (!identity)
    return {
      state: { ...state, unvouched: new Set(state.unvouched).add(endpoint) },
      joined: null,
      unvouched: !state.unvouched.has(endpoint),
    };
  const placed = { endpoint, identity };
  if (identity.id !== hooks.self) return place(state, placed);
  const self = {
    endpoint: hooks.selfEndpoint(),
    identity: {
      id: hooks.self,
      ...(hooks.joinedAt === undefined ? {} : { joinedAt: hooks.joinedAt }),
    },
  };
  return ours(state, placed, self);
}

export function createRoster(hooks: RosterHooks): Roster {
  let state: RosterState = {
    endpoints: new Map(),
    unvouched: new Set(),
    ignored: new Set(),
    started: false,
  };
  return {
    join(endpoint, participant) {
      const step = join(state, hooks, endpoint, participant);
      state = step.state;
      if (step.unvouched) hooks.onUnvouched(endpoint);
      if (step.duplicate) hooks.onDuplicate();
      return step.joined;
    },
    leave(endpoint) {
      const identity = state.endpoints.get(endpoint);
      if (!identity) return null;
      const endpoints = new Map(
        [...state.endpoints].filter(([known]) => known !== endpoint),
      );
      state = { ...state, endpoints };
      return identity.id;
    },
    idOf: (endpoint) => state.endpoints.get(endpoint)?.id,
    endpointOf: (participant) =>
      [...state.endpoints].find(([, id]) => id.id === participant)?.[0],
    knows: (endpoint) =>
      state.endpoints.has(endpoint) || state.ignored.has(endpoint),
    start() {
      state = { ...state, started: true };
    },
  };
}
