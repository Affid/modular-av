import type { Channel, ParticipantId } from "@modular-av/api";
import {
  type Claim,
  MAX_CLAIMS_PER_SENDER,
  PROTOCOL,
  readClaim,
} from "./binding-messages.ts";
import type { JitsiParticipant } from "./sdk-types.ts";

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

export function createBinding(options: BindingOptions): Binding {
  const { channel, room } = options;
  let held: readonly Held[] = [];
  let gone: readonly string[] = [];
  let ours: string | null = null;

  const claim = (type: Claim["type"], endpoint: string): Claim => ({
    v: PROTOCOL,
    type,
    room,
    endpoint,
    joinedAt: options.joinedAt,
  });

  const isHeld = (h: Held): boolean =>
    held.some((k) => k.user === h.user && k.endpoint === h.endpoint);

  /**
   * Each claim is acted on once: a repeat changes nothing. Every hello is
   * answered, though: its sender says it again when it may have missed
   * ours. A claim on an endpoint that already left is dropped: whoever
   * takes that name next would otherwise be placed by it.
   */
  const unsubscribe = channel.on((data, sender) => {
    const read = readClaim(data, room);
    if (!read || gone.includes(read.endpoint)) return;
    if (read.type === "hello" && ours !== null)
      channel.send(claim("welcome", ours), { recipients: [sender] });
    const fresh = {
      user: sender,
      endpoint: read.endpoint,
      joinedAt: read.joinedAt,
    };
    if (isHeld(fresh)) return;
    held = keep(held, fresh);
    options.onClaim(read.endpoint);
  });
  // Claims sent or answered while Foundry's socket was down never came.
  const stopReconnect = options.onReconnect(() => {
    if (ours !== null) channel.send(claim("hello", ours));
  });

  return {
    identify(endpoint, participant) {
      const named = participant.getProperty(PRESENCE_KEY);
      if (typeof named !== "string") return null;
      const found = held.find(
        (h) => h.endpoint === endpoint && h.user === named,
      );
      return found ? { id: found.user, joinedAt: found.joinedAt } : null;
    },
    announce(endpoint) {
      ours = endpoint;
      // A claim from before we joined on an endpoint not here left unseen:
      // whoever takes that name next would be placed by it. Anyone still
      // coming claims again, in answer to our hello.
      held = held.filter((h) => options.isPresent(h.endpoint));
      channel.send(claim("hello", endpoint));
    },
    forget(endpoint) {
      held = held.filter((h) => h.endpoint !== endpoint);
      gone = [...gone.filter((g) => g !== endpoint), endpoint].slice(-MAX_GONE);
    },
    stop() {
      unsubscribe();
      stopReconnect();
      held = [];
    },
  };
}
