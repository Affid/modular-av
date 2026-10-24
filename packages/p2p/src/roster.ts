import type { ParticipantId } from "@modular-av/api";

/**
 * One connection of a user to the call. `joinedAt` is the sender's clock,
 * so a modified client could claim an early place; the trust model
 * (handoff §3) accepts that.
 */
export interface Presence {
  readonly user: ParticipantId;
  readonly session: string;
  readonly joinedAt: number;
}

/** The others in the call: the newest session of each user. */
export interface Roster {
  readonly self: Presence;
  readonly members: ReadonlyMap<ParticipantId, Presence>;
}

export type Meeting =
  | { readonly kind: "added" }
  | { readonly kind: "replaced"; readonly previous: Presence }
  | { readonly kind: "known" }
  /** An older session of a user we already have. */
  | { readonly kind: "stale" }
  /** A newer tab of this user: this one gives way. */
  | { readonly kind: "yield" }
  /** An older tab of this user: it must give way. */
  | { readonly kind: "outlived" }
  | { readonly kind: "self" };

export const createRoster = (self: Presence): Roster => ({
  self,
  members: new Map(),
});

/** The later join wins; the larger session id breaks a tie. */
const isNewer = (a: Presence, b: Presence): boolean =>
  a.joinedAt !== b.joinedAt ? a.joinedAt > b.joinedAt : a.session > b.session;

/** A hello or welcome from `presence`. */
export function meet(
  roster: Roster,
  presence: Presence,
): { readonly roster: Roster; readonly meeting: Meeting } {
  const { self } = roster;
  if (presence.user === self.user) {
    if (presence.session === self.session)
      return { roster, meeting: { kind: "self" } };
    const kind = isNewer(presence, self) ? "yield" : "outlived";
    return { roster, meeting: { kind } };
  }
  const known = roster.members.get(presence.user);
  if (known?.session === presence.session)
    return { roster, meeting: { kind: "known" } };
  if (known && !isNewer(presence, known))
    return { roster, meeting: { kind: "stale" } };
  const members = new Map(roster.members).set(presence.user, presence);
  return {
    roster: { self, members },
    meeting: known ? { kind: "replaced", previous: known } : { kind: "added" },
  };
}

/** A session left; a newer session of the same user stays. */
export function part(
  roster: Roster,
  user: ParticipantId,
  session: string,
): Roster {
  if (roster.members.get(user)?.session !== session) return roster;
  const members = new Map(roster.members);
  members.delete(user);
  return { ...roster, members };
}

/**
 * Whether this client is past the cap. Everyone ranks the call the same
 * way (GMs first, then the earliest join, then the user id), so when two
 * join at once, the one ranked past the cap leaves by itself. GMs are
 * always let in.
 */
export function isOverCap(
  roster: Roster,
  cap: number,
  isGM: (user: ParticipantId) => boolean,
): boolean {
  const { self } = roster;
  if (isGM(self.user)) return false;
  const rank = (p: Presence): readonly [number, number, string] => [
    isGM(p.user) ? 0 : 1,
    p.joinedAt,
    p.user,
  ];
  const ahead = [...roster.members.values()].filter((p) => {
    const [a, b] = [rank(p), rank(self)];
    if (a[0] !== b[0]) return a[0] < b[0];
    if (a[1] !== b[1]) return a[1] < b[1];
    return a[2] < b[2];
  });
  return ahead.length >= cap;
}
