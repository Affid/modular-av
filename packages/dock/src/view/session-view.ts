import type { SessionEndReason, SessionState } from "@modular-av/api";

export type StatusKind =
  "idle" | "connecting" | "connected" | "waiting" | "reconnecting" | "ended";

/** A key of the dock's language file, with what fills it in. */
export interface Text {
  readonly key: string;
  readonly params?: Readonly<Record<string, string>>;
}

export interface StatusView {
  /** `data-status` on the status element (part of the UI contract). */
  readonly kind: StatusKind;
  readonly text: Text;
  /** What the player can do about it. */
  readonly action: "reconnect" | "rejoin" | null;
}

/** Ended for these, the player may try again; for the others, retrying can't help. */
const REJOINABLE: ReadonlySet<SessionEndReason> = new Set([
  "left",
  "full",
  "joined-elsewhere",
  "room-closed",
]);

function ended(reason: SessionEndReason | null): StatusView {
  const why = reason ?? "left";
  return {
    kind: "ended",
    text: { key: `status.ended.${why}` },
    action: REJOINABLE.has(why) ? "rejoin" : null,
  };
}

const view = (
  kind: StatusKind,
  key: string,
  action: StatusView["action"] = null,
): StatusView => ({ kind, text: { key: `status.${key}` }, action });

/** The session's status for the player; `now` for the countdown. */
export function sessionView(session: SessionState, now: number): StatusView {
  switch (session.status) {
    case "idle":
      return view("idle", "idle");
    case "waiting-for-token":
    case "connecting":
      return view("connecting", "connecting");
    case "connected":
      return view("connected", "connected");
    case "waiting-for-gm":
      return view("waiting", "waitingForGm");
    case "resuming":
      return view("reconnecting", "resuming");
    case "retrying": {
      const ms = Math.max(0, (session.nextRetryAt ?? now) - now);
      return {
        kind: "reconnecting",
        text: {
          key: "status.retrying",
          params: { seconds: String(Math.ceil(ms / 1000)) },
        },
        action: "reconnect",
      };
    }
    case "left":
      return ended(session.reason);
  }
}
