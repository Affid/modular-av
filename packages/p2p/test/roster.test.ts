import { describe, expect, it } from "vitest";
import {
  createRoster,
  isOverCap,
  meet,
  part,
  type Presence,
} from "../src/roster.ts";

const self: Presence = { user: "alice", session: "s-a1", joinedAt: 100 };
const bob: Presence = { user: "bob", session: "s-b1", joinedAt: 200 };

describe("meeting others", () => {
  it("adds a new user, and knows them when they say hello again", () => {
    const first = meet(createRoster(self), bob);
    const again = meet(first.roster, bob);

    expect(first.meeting).toEqual({ kind: "added" });
    expect([...first.roster.members.values()]).toEqual([bob]);
    expect(again.meeting).toEqual({ kind: "known" });
    expect(again.roster).toBe(first.roster);
  });

  it("keeps the newest session of a user and ignores older ones", () => {
    const roster = meet(createRoster(self), bob).roster;
    const newer = { ...bob, session: "s-b2", joinedAt: 300 };
    const older = { ...bob, session: "s-b0", joinedAt: 150 };

    const replaced = meet(roster, newer);
    const stale = meet(replaced.roster, older);

    expect(replaced.meeting).toEqual({ kind: "replaced", previous: bob });
    expect(replaced.roster.members.get("bob")).toEqual(newer);
    expect(stale.meeting).toEqual({ kind: "stale" });
    expect(stale.roster.members.get("bob")).toEqual(newer);
  });

  it("breaks a tie in join times by session id", () => {
    const roster = meet(createRoster(self), bob).roster;

    const meeting = meet(roster, { ...bob, session: "s-b2" }).meeting;

    expect(meeting.kind).toBe("replaced");
  });

  it("gives way to a newer tab of the same user, and outlives an older one", () => {
    const roster = createRoster(self);

    const newer = meet(roster, { ...self, session: "s-a2", joinedAt: 101 });
    const older = meet(roster, { ...self, session: "s-a0", joinedAt: 99 });
    const own = meet(roster, self);

    expect(newer.meeting).toEqual({ kind: "yield" });
    expect(older.meeting).toEqual({ kind: "outlived" });
    expect(own.meeting).toEqual({ kind: "self" });
    expect(newer.roster.members.size).toBe(0);
  });

  it("forgets a session that left, but not a newer one of the same user", () => {
    const roster = meet(createRoster(self), bob).roster;

    expect(part(roster, "bob", "s-b0")).toBe(roster);
    expect(part(roster, "bob", "s-b1").members.size).toBe(0);
  });
});

describe("the cap", () => {
  const members = (...list: Presence[]): readonly Presence[] => list;
  const gm = new Set(["gm"]);
  const isGM = (id: string): boolean => gm.has(id);
  const rosterOf = (me: Presence, others: readonly Presence[]) =>
    others.reduce((r, p) => meet(r, p).roster, createRoster(me));

  it("lets in everyone up to the cap, earliest first", () => {
    const others = members(
      { user: "p1", session: "s1", joinedAt: 10 },
      { user: "p2", session: "s2", joinedAt: 20 },
    );

    expect(isOverCap(rosterOf(self, others), 3, isGM)).toBe(false);
    expect(isOverCap(rosterOf(self, others), 2, isGM)).toBe(true);
  });

  it("ranks GMs first and never turns one away", () => {
    const late = { user: "gm", session: "s-gm", joinedAt: 999 };
    const others = members({ user: "p1", session: "s1", joinedAt: 10 });

    expect(isOverCap(rosterOf(self, [...others, late]), 2, isGM)).toBe(true);
    expect(isOverCap(rosterOf(late, [...others, self]), 1, isGM)).toBe(false);
  });

  it("breaks a tie in join times by user id", () => {
    const twin = { user: "aaron", session: "s-x", joinedAt: 100 };

    expect(isOverCap(rosterOf(self, [twin]), 1, isGM)).toBe(true);
    expect(isOverCap(rosterOf(twin, [self]), 1, isGM)).toBe(false);
  });
});
