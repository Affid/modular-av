import type { Channel, ParticipantId } from "@modular-av/api";
import {
  type Claim,
  MAX_CLAIMS_PER_SENDER,
  PROTOCOL,
  readClaim,
} from "./binding-messages.ts";
import type { JitsiParticipant } from "./sdk-types.ts";
import { type Allowances, drawWelcome } from "./welcome-limit.ts";

/** The presence property naming a participant's Foundry user. */
export const PRESENCE_KEY = "modular-av-user";

/** A participant vouched for, and when their page joined (open servers). */
export interface Identity {
  readonly id: ParticipantId;
  readonly joinedAt: number;
}

export interface BindingOptions {
  readonly channel: Channel;
  /** The Jitsi room joined. */
  readonly room: string;
  readonly self: ParticipantId;
  /** When this page first joined. */
  readonly joinedAt: number;
  /** Whether the endpoint is in the room, as our conference has it. */
  readonly isPresent: (endpoint: string) => boolean;
  readonly now: () => number;
  /** A claim on this endpoint arrived: who it is may be known now. */
  readonly onClaim: (endpoint: string) => void;
  /** Foundry's socket connected again: messages meanwhile were lost. */
  readonly onReconnect: (listener: () => void) => () => void;
}

/**
 * Who is who on an open server, where Jitsi vouches for nobody: each
 * client names its Foundry user in its presence and claims its endpoint
 * over the core's socket, where Foundry names the sender. Either alone is
 * anyone's word; an endpoint is a user's only when both name them. So
 * nobody outside the world gets a place, and no player can take another's.
 */
export interface Binding {
  identify(endpoint: string, participant: JitsiParticipant): Identity | null;
  /**
   * Once joined: tells everyone our endpoint, and answers hellos from then
   * on. Claims held for endpoints not in the room are dropped.
   */
  announce(endpoint: string): void;
  /** The endpoint left the room. */
  forget(endpoint: string): void;
  stop(): void;
}

interface Held {
  readonly user: ParticipantId;
  readonly endpoint: string;
  readonly joinedAt: number;
}

/** The newest claims, at most `MAX_CLAIMS_PER_SENDER` per user. */
function keep(held: readonly Held[], claim: Held): readonly Held[] {
  const others = held.filter(
    (h) => !(h.user === claim.user && h.endpoint === claim.endpoint),
  );
  const theirs = others.filter((h) => h.user === claim.user);
  const dropped = theirs.slice(
    0,
    Math.max(0, theirs.length - MAX_CLAIMS_PER_SENDER + 1),
  );
  return [...others.filter((h) => !dropped.includes(h)), claim];
}

/** Endpoints that left, remembered so a late claim on one is dropped. */
const MAX_GONE = 256;

/** What the binding holds and has seen. */
interface BindingState {
  readonly held: readonly Held[];
  readonly gone: readonly string[];
  /** Our endpoint, once joined. */
  readonly ours: string | null;
  readonly allowances: Allowances;
}

/** A claim's outcome: the new state, and what to do about it. */
interface Received {
  readonly state: BindingState;
  /** Answer its sender with our claim. */
  readonly welcome: boolean;
  /** A claim not held before: who that endpoint is may be known now. */
  readonly fresh: boolean;
}

/**
 * Each claim is acted on once: a repeat changes nothing. Every hello is
 * answered, though (within the sender's allowance): its sender says it
 * again when it may have missed ours. A claim on an endpoint that already
 * left is dropped: whoever takes that name next would otherwise be placed
 * by it.
 */
function receive(
  state: BindingState,
  read: Claim,
  sender: ParticipantId,
  now: number,
): Received {
  if (state.gone.includes(read.endpoint))
    return { state, welcome: false, fresh: false };
  const drawn =
    read.type === "hello" && state.ours !== null
      ? drawWelcome(state.allowances, sender, now)
      : null;
  const claim = {
    user: sender,
    endpoint: read.endpoint,
    joinedAt: read.joinedAt,
  };
  const fresh = !state.held.some(
    (h) => h.user === claim.user && h.endpoint === claim.endpoint,
  );
  return {
    state: {
      ...state,
      allowances: drawn?.allowances ?? state.allowances,
      held: fresh ? keep(state.held, claim) : state.held,
    },
    welcome: drawn?.allowed === true,
    fresh,
  };
}

/** The participant's Foundry user, when their presence and a claim agree. */
function identify(
  held: readonly Held[],
  endpoint: string,
  participant: JitsiParticipant,
): Identity | null {
  const named = participant.getProperty(PRESENCE_KEY);
  if (typeof named !== "string") return null;
  const found = held.find((h) => h.endpoint === endpoint && h.user === named);
  return found ? { id: found.user, joinedAt: found.joinedAt } : null;
}

const message = (
  options: BindingOptions,
  type: Claim["type"],
  endpoint: string,
): Claim => ({
  v: PROTOCOL,
  type,
  room: options.room,
  endpoint,
  joinedAt: options.joinedAt,
});

export function createBinding(options: BindingOptions): Binding {
  const { channel } = options;
  let state: BindingState = {
    held: [],
    gone: [],
    ours: null,
    allowances: new Map(),
  };
  const say = (type: Claim["type"], endpoint: string, to?: string): void => {
    const data = message(options, type, endpoint);
    if (to === undefined) channel.send(data);
    else channel.send(data, { recipients: [to] });
  };
  const unsubscribe = channel.on((data, sender) => {
    const read = readClaim(data, options.room);
    if (!read) return;
    const received = receive(state, read, sender, options.now());
    state = received.state;
    if (received.welcome && state.ours !== null)
      say("welcome", state.ours, sender);
    if (received.fresh) options.onClaim(read.endpoint);
  });
  // Claims sent or answered while Foundry's socket was down never came.
  const stopReconnect = options.onReconnect(() => {
    if (state.ours !== null) say("hello", state.ours);
  });
  return {
    identify: (endpoint, participant) =>
      identify(state.held, endpoint, participant),
    announce(endpoint) {
      // A claim from before we joined on an endpoint not here left unseen:
      // whoever takes that name next would be placed by it. Anyone still
      // coming claims again, in answer to our hello.
      const held = state.held.filter((h) => options.isPresent(h.endpoint));
      state = { ...state, ours: endpoint, held };
      say("hello", endpoint);
    },
    forget(endpoint) {
      const held = state.held.filter((h) => h.endpoint !== endpoint);
      const gone = [...state.gone.filter((g) => g !== endpoint), endpoint];
      state = { ...state, held, gone: gone.slice(-MAX_GONE) };
    },
    stop() {
      unsubscribe();
      stopReconnect();
      state = { ...state, held: [] };
    },
  };
}
