import type {
  ConnectionQuality,
  ParticipantId,
  RemoteTrack,
  ServiceError,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import { fromConferenceError, type Attempt } from "./errors.ts";
import { identityOf, remoteTrack } from "./remote.ts";
import type {
  JitsiConference,
  JitsiMeetJS,
  JitsiParticipant,
  JitsiTrack,
  Listener,
} from "./sdk-types.ts";

/** What the events change: who is in the call, by bridge endpoint id. */
export interface Roster {
  /** Endpoint id → Foundry user id, for participants the server vouched for. */
  readonly endpoints: ReadonlyMap<string, ParticipantId>;
}

export interface ConferenceHooks {
  readonly self: ParticipantId;
  readonly emitter: Emitter;
  readonly attempt: () => Attempt;
  /** Whether we are leaving on purpose: then the end isn't reported. */
  readonly leaving: () => boolean;
  /** A participant without a server-vouched identity (once each). */
  readonly onUnvouched: (endpoint: string) => void;
  /** The same Foundry user joined again elsewhere: this one is older. */
  readonly onDuplicate: () => void;
  readonly onEnd: (error: ServiceError) => void;
  /** A remote track arrived: its bridge source name, for subscriptions. */
  readonly onTrack: (
    sourceName: string,
    kind: string,
    remote: RemoteTrack,
  ) => void;
}

/** Jitsi's connection quality (0 to 100) as the core's words. */
export function qualityOf(percent: number): ConnectionQuality {
  if (percent >= 70) return "excellent";
  if (percent >= 40) return "good";
  if (percent > 0) return "poor";
  return "lost";
}

export interface WiredConference {
  readonly roster: () => Roster;
  /**
   * Once joined: reports what happened while joining (the core listens
   * only after `connect()` resolved), then reports as it happens.
   */
  readonly start: () => void;
}

/** Turns a conference's events into the core's service events. */
export function wireConference(
  sdk: JitsiMeetJS,
  conference: JitsiConference,
  hooks: ConferenceHooks,
): WiredConference {
  const events = sdk.events.conference;
  let endpoints = new Map<string, ParticipantId>();
  let unvouched: ReadonlySet<string> = new Set();
  /** Older tabs of this same player, still in the room: never ours to show. */
  let olderTabs: ReadonlySet<string> = new Set();
  let started = false;
  let queued: readonly (() => void)[] = [];
  const later = (report: () => void): void => {
    if (started) report();
    else queued = [...queued, report];
  };
  const on = (event: string | undefined, listener: Listener): void => {
    if (event) conference.on(event, listener);
  };

  const join = (endpoint: string, participant: JitsiParticipant): void => {
    if (endpoints.has(endpoint) || olderTabs.has(endpoint)) return;
    const id = identityOf(participant);
    if (!id) {
      if (!unvouched.has(endpoint)) hooks.onUnvouched(endpoint);
      unvouched = new Set(unvouched).add(endpoint);
      return;
    }
    if (id === hooks.self) {
      // Already here when we joined: that tab is the older one and leaves
      // (or has closed, and the server still keeps its session a while).
      if (started) hooks.onDuplicate();
      else olderTabs = new Set(olderTabs).add(endpoint);
      return;
    }
    endpoints = new Map(endpoints).set(endpoint, id);
    later(() => {
      hooks.emitter.emit("participantJoined", id);
    });
  };
  const leave = (endpoint: string): void => {
    const id = endpoints.get(endpoint);
    if (!id) return;
    const rest = new Map(endpoints);
    rest.delete(endpoint);
    endpoints = rest;
    if (![...rest.values()].includes(id))
      later(() => {
        hooks.emitter.emit("participantLeft", id);
      });
  };
  const track = (name: "trackAdded" | "trackRemoved") => (t: JitsiTrack) => {
    if (t.isLocal()) return;
    const endpoint = t.getParticipantId();
    if (name === "trackAdded") {
      const participant = conference.getParticipantById(endpoint);
      if (participant) join(endpoint, participant);
    }
    const id = endpoints.get(endpoint);
    const remote = id ? remoteTrack(id, t) : null;
    if (!remote) return;
    if (name === "trackAdded")
      hooks.onTrack(t.getSourceName(), t.getType(), remote);
    later(() => {
      hooks.emitter.emit(name, remote);
    });
  };

  on(events.USER_JOINED, join);
  on(events.USER_LEFT, leave);
  on(events.TRACK_ADDED, track("trackAdded"));
  on(events.TRACK_REMOVED, track("trackRemoved"));
  on(events.CONNECTION_INTERRUPTED, () => {
    hooks.emitter.emit("state", "resuming");
  });
  on(events.CONNECTION_RESTORED, () => {
    hooks.emitter.emit("state", "connected");
  });
  on(events.KICKED, () => {
    hooks.onEnd({
      code: "kicked",
      final: true,
      message: "Removed from the room",
    });
  });
  on(events.CONFERENCE_FAILED, (error: string) => {
    if (!hooks.leaving())
      hooks.onEnd(fromConferenceError(error, hooks.attempt()));
  });
  on(
    sdk.events.connectionQuality.REMOTE_STATS_UPDATED,
    (endpoint: string, stats: { connectionQuality?: number }) => {
      const id = endpoints.get(endpoint);
      if (id && typeof stats.connectionQuality === "number")
        hooks.emitter.emit("quality", id, qualityOf(stats.connectionQuality));
    },
  );

  return {
    roster: () => ({ endpoints }),
    start() {
      for (const participant of conference.getParticipants())
        join(participant.getId(), participant);
      started = true;
      const reports = queued;
      queued = [];
      for (const report of reports) report();
    },
  };
}
