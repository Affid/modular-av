import type { ParticipantId } from "@modular-av/api";
import { identityOf } from "./remote.ts";
import type { JitsiParticipant } from "./sdk-types.ts";

/**
 * Who is in the room, by bridge endpoint: only participants whose
 * identity the server vouched for, one Foundry user per identity however
 * many endpoints (tabs) they have.
 */
export interface Roster {
  /** A newly present Foundry user, or null (known, ignored, or ours). */
  join(endpoint: string, participant: JitsiParticipant): ParticipantId | null;
  /** A Foundry user now gone entirely, or null. */
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
  /** Older tabs of this same player, still in the room: never shown. */
  let olderTabs: ReadonlySet<string> = new Set();
  let started = false;

  /**
   * Our own identity elsewhere. Already there when we joined: that tab
   * is the older one and leaves (or has closed, and the server keeps its
   * session a while). Known limit: a tab that joins while we are still
   * joining counts as older too, and both stay.
   */
  const ours = (endpoint: string): null => {
    if (started) hooks.onDuplicate();
    else olderTabs = new Set(olderTabs).add(endpoint);
    return null;
  };

  return {
    join(endpoint, participant) {
      if (endpoints.has(endpoint) || olderTabs.has(endpoint)) return null;
      const id = identityOf(participant);
      if (!id) {
        if (!unvouched.has(endpoint)) hooks.onUnvouched(endpoint);
        unvouched = new Set(unvouched).add(endpoint);
        return null;
      }
      if (id === hooks.self) return ours(endpoint);
      const known = [...endpoints.values()].includes(id);
      endpoints = new Map(endpoints).set(endpoint, id);
      return known ? null : id;
    },
    leave(endpoint) {
      const id = endpoints.get(endpoint);
      if (!id) return null;
      const rest = new Map(endpoints);
      rest.delete(endpoint);
      endpoints = rest;
      return [...rest.values()].includes(id) ? null : id;
    },
    idOf: (endpoint) => endpoints.get(endpoint),
    endpointOf: (participant) =>
      [...endpoints].find(([, id]) => id === participant)?.[0],
    start() {
      started = true;
    },
  };
}
