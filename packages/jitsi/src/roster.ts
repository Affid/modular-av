import type { ParticipantId } from "@modular-av/api";
import { identityOf } from "./remote.ts";
import type { JitsiParticipant } from "./sdk-types.ts";

/** Someone newly present, and the older endpoints of theirs they replace. */
export interface Joined {
  readonly id: ParticipantId;
  readonly replaced: readonly string[];
}

/**
 * Who is in the room, by bridge endpoint: only participants whose
 * identity the server vouched for, one endpoint per Foundry user. A
 * newer endpoint replaces an older one, as the core's "newer tab wins":
 * a player who reloads stays in the room a while (the server keeps the
 * old session for resumption), and the older tab ends itself.
 */
export interface Roster {
  /** Who is newly present, or null (known, ignored, or ours). */
  join(endpoint: string, participant: JitsiParticipant): Joined | null;
  /** A Foundry user now gone, or null. */
  leave(endpoint: string): ParticipantId | null;
  idOf(endpoint: string): ParticipantId | undefined;
  endpointOf(participant: ParticipantId): string | undefined;
  /** From now on another endpoint of ours is a newer tab. */
  start(): void;
}

export interface RosterHooks {
  readonly self: ParticipantId;
  /** A participant without a server-vouched identity (once each). */
  readonly onUnvouched: (endpoint: string) => void;
  /** The same Foundry user joined again elsewhere: this one is older. */
  readonly onDuplicate: () => void;
}

export function createRoster(hooks: RosterHooks): Roster {
  let endpoints = new Map<string, ParticipantId>();
  let unvouched: ReadonlySet<string> = new Set();
  /** Older tabs, ours or replaced ones: never shown again. */
  let ignored: ReadonlySet<string> = new Set();
  let started = false;

  /**
   * Our own identity elsewhere. Already there when we joined: that tab
   * is the older one and leaves (or has closed, and the server keeps its
   * session a while). Known limit: a tab that joins while we are still
   * joining counts as older too, and both stay.
   */
  const ours = (endpoint: string): null => {
    if (started) hooks.onDuplicate();
    else ignored = new Set(ignored).add(endpoint);
    return null;
  };

  return {
    join(endpoint, participant) {
      if (endpoints.has(endpoint) || ignored.has(endpoint)) return null;
      const id = identityOf(participant);
      if (!id) {
        if (!unvouched.has(endpoint)) hooks.onUnvouched(endpoint);
        unvouched = new Set(unvouched).add(endpoint);
        return null;
      }
      if (id === hooks.self) return ours(endpoint);
      const replaced = [...endpoints]
        .filter(([, known]) => known === id)
        .map(([old]) => old);
      ignored = new Set([...ignored, ...replaced]);
      endpoints = new Map(
        [...endpoints].filter(([old]) => !replaced.includes(old)),
      ).set(endpoint, id);
      return { id, replaced };
    },
    leave(endpoint) {
      const id = endpoints.get(endpoint);
      if (!id) return null;
      const rest = new Map(endpoints);
      rest.delete(endpoint);
      endpoints = rest;
      return id;
    },
    idOf: (endpoint) => endpoints.get(endpoint),
    endpointOf: (participant) =>
      [...endpoints].find(([, id]) => id === participant)?.[0],
    start() {
      started = true;
    },
  };
}
