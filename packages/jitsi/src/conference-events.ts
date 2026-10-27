import type {
  ConnectionQuality,
  ParticipantId,
  RemoteTrack,
  ServiceError,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import { fromConferenceError, type Attempt } from "./errors.ts";
import { remoteTrack } from "./remote.ts";
import { createRoster, type Roster } from "./roster.ts";
import type {
  JitsiConference,
  JitsiMeetJS,
  JitsiParticipant,
  JitsiTrack,
  Listener,
} from "./sdk-types.ts";

/** A remote source as the bridge names it, with its owner's endpoint. */
export interface BridgeSource {
  readonly endpoint: string;
  readonly sourceName: string;
}

export interface ConferenceHooks {
  readonly self: ParticipantId;
  readonly emitter: Emitter;
  readonly attempt: () => Attempt;
  /** Leaving or ended: nothing more is reported or ended. */
  readonly closed: () => boolean;
  readonly onUnvouched: (endpoint: string) => void;
  readonly onDuplicate: () => void;
  readonly onEnd: (error: ServiceError) => void;
  /** A remote track arrived, for subscriptions. */
  readonly onTrack: (
    source: BridgeSource,
    kind: string,
    remote: RemoteTrack,
  ) => void;
  /** A remote track went, or its endpoint left (no source name). */
  readonly onTrackGone: (
    source: BridgeSource | { readonly endpoint: string },
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
  readonly roster: Roster;
  /**
   * Once joined: reports what happened while joining (the core listens
   * only after `connect()` resolved), then reports as it happens.
   */
  readonly start: () => void;
}

/** Holds reports until joined, and drops them once closed. */
function createReports(closed: () => boolean): {
  later(report: () => void): void;
  start(): void;
} {
  let started = false;
  let queued: readonly (() => void)[] = [];
  return {
    later(report) {
      if (closed()) return;
      if (started) report();
      else queued = [...queued, report];
    },
    start() {
      started = true;
      const reports = queued;
      queued = [];
      for (const report of reports) if (!closed()) report();
    },
  };
}

interface Wiring {
  readonly conference: JitsiConference;
  readonly hooks: ConferenceHooks;
  readonly roster: Roster;
  readonly reports: ReturnType<typeof createReports>;
}

function joinOf(w: Wiring) {
  return (endpoint: string, participant: JitsiParticipant): void => {
    const id = w.roster.join(endpoint, participant);
    if (id)
      w.reports.later(() => {
        w.hooks.emitter.emit("participantJoined", id);
      });
  };
}

function leaveOf(w: Wiring) {
  return (endpoint: string): void => {
    w.hooks.onTrackGone({ endpoint });
    const id = w.roster.leave(endpoint);
    if (id)
      w.reports.later(() => {
        w.hooks.emitter.emit("participantLeft", id);
      });
  };
}

/** A remote track of a vouched participant, after their join. */
function trackOf(w: Wiring, name: "trackAdded" | "trackRemoved") {
  const join = joinOf(w);
  return (t: JitsiTrack): void => {
    if (t.isLocal()) return;
    const endpoint = t.getParticipantId();
    const participant = w.conference.getParticipantById(endpoint);
    if (name === "trackAdded" && participant) join(endpoint, participant);
    const id = w.roster.idOf(endpoint);
    const remote = id ? remoteTrack(id, t) : null;
    if (!remote) return;
    const source = { endpoint, sourceName: t.getSourceName() };
    if (name === "trackAdded") w.hooks.onTrack(source, t.getType(), remote);
    else w.hooks.onTrackGone(source);
    w.reports.later(() => {
      w.hooks.emitter.emit(name, remote);
    });
  };
}

function wireState(
  sdk: JitsiMeetJS,
  w: Wiring,
  on: (e: string | undefined, l: Listener) => void,
): void {
  const events = sdk.events.conference;
  const { hooks } = w;
  on(events.CONNECTION_INTERRUPTED, () => {
    if (!hooks.closed()) hooks.emitter.emit("state", "resuming");
  });
  on(events.CONNECTION_RESTORED, () => {
    if (!hooks.closed()) hooks.emitter.emit("state", "connected");
  });
  on(events.KICKED, () => {
    hooks.onEnd({
      code: "kicked",
      final: true,
      message: "Removed from the room",
    });
  });
  on(events.CONFERENCE_FAILED, (error: string) => {
    hooks.onEnd(fromConferenceError(error, hooks.attempt()));
  });
  on(
    sdk.events.connectionQuality.REMOTE_STATS_UPDATED,
    (endpoint: string, stats: { connectionQuality?: number }) => {
      const id = w.roster.idOf(endpoint);
      if (id && !hooks.closed() && typeof stats.connectionQuality === "number")
        hooks.emitter.emit("quality", id, qualityOf(stats.connectionQuality));
    },
  );
}

/** Turns a conference's events into the core's service events. */
export function wireConference(
  sdk: JitsiMeetJS,
  conference: JitsiConference,
  hooks: ConferenceHooks,
): WiredConference {
  const w: Wiring = {
    conference,
    hooks,
    roster: createRoster(hooks),
    reports: createReports(hooks.closed),
  };
  const events = sdk.events.conference;
  const on = (event: string | undefined, listener: Listener): void => {
    if (event) conference.on(event, listener);
  };
  on(events.USER_JOINED, joinOf(w));
  on(events.USER_LEFT, leaveOf(w));
  on(events.TRACK_ADDED, trackOf(w, "trackAdded"));
  on(events.TRACK_REMOVED, trackOf(w, "trackRemoved"));
  wireState(sdk, w, on);
  return {
    roster: w.roster,
    start() {
      const join = joinOf(w);
      for (const participant of conference.getParticipants())
        join(participant.getId(), participant);
      w.roster.start();
      w.reports.start();
    },
  };
}
