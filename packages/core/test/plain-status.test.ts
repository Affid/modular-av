import type { SessionState, SessionStatus } from "@modular-av/api";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE } from "../src/state/initial.ts";
import { deafenedIds, sessionNotice } from "../src/status/plain-status.ts";

const at = (
  status: SessionStatus,
  reason: SessionState["reason"] = null,
): SessionState => ({ status, attempt: 0, nextRetryAt: null, reason });

const keys = (path: readonly SessionState[]): (string | null)[] => {
  let memo = { lost: false };
  return path.slice(1).map((next, i) => {
    const prev = path[i] ?? next;
    const step = sessionNotice(prev, next, memo);
    memo = step.memo;
    return step.notice ? `${step.notice.kind}:${step.notice.key}` : null;
  });
};

describe("session notices", () => {
  it("warns once per outage and confirms the reconnection", () => {
    expect(
      keys([
        at("connected"),
        at("retrying"),
        at("waiting-for-token"),
        at("retrying"),
        at("connecting"),
        at("connected"),
        at("connected"),
      ]),
    ).toEqual([
      "warn:modular-av.status.reconnecting",
      null,
      null,
      null,
      "info:modular-av.status.reconnected",
      null,
    ]);
  });

  it("says when it waits for a GM and why it ended", () => {
    expect(
      keys([
        at("waiting-for-token"),
        at("waiting-for-gm"),
        at("left", "kicked"),
        at("idle"),
        at("left", "left"),
      ]),
    ).toEqual([
      "info:modular-av.status.waitingForGm",
      "error:modular-av.status.ended.kicked",
      null,
      null,
    ]);
  });

  it("forgets an outage once the session ended", () => {
    expect(
      keys([
        at("connected"),
        at("retrying"),
        at("left", "left"),
        at("connected"),
      ]),
    ).toEqual(["warn:modular-av.status.reconnecting", null, null]);
  });
});

describe("deafened badges", () => {
  it("marks active deafened players only", () => {
    const base = {
      id: "",
      name: "",
      color: null,
      avatar: null,
      isGM: false,
      isLocal: false,
      active: true,
      connected: true,
      hasAudio: false,
      hasVideo: false,
      speaking: false,
      muted: false,
      hidden: false,
      deafened: true,
      canBroadcast: { audio: true, video: true },
      blockedAudio: false,
      blockedVideo: false,
      volume: 1,
      hiddenByMe: false,
      quality: null,
    };
    const state = {
      ...INITIAL_STATE,
      participants: {
        a: { ...base, id: "a" },
        b: { ...base, id: "b", active: false },
        c: { ...base, id: "c", deafened: false },
      },
    };

    expect([...deafenedIds(state)]).toEqual(["a"]);
  });
});
