import type {
  ConnectionQuality,
  ParticipantId,
  RemoteTrack,
  ServiceError,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import { fromConferenceError, type Attempt } from "./errors.ts";
import { remoteTrack, sourceOf } from "./remote.ts";
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

interface Told {
  readonly source: BridgeSource;
  readonly remote: RemoteTrack;
}

/** The remote tracks told to the core and not taken back since. */
function createReported(): {
  find(source: BridgeSource): RemoteTrack | undefined;
  /** False for a source already told. */
  add(source: BridgeSource, remote: RemoteTrack): boolean;
  /** What was told of the source, now taken back. */
  remove(source: BridgeSource): RemoteTrack | undefined;
  forget(endpoint: string): void;
} {
  let reported: readonly Told[] = [];
  const of = (source: BridgeSource) => (told: Told) =>
    told.source.endpoint === source.endpoint &&
    told.source.sourceName === source.sourceName;
  return {
    find: (source) => reported.find(of(source))?.remote,
    add(source, remote) {
      if (reported.some(of(source))) return false;
      reported = [...reported, { source, remote }];
      return true;
    },
    remove(source) {
      const told = reported.find(of(source));
      reported = reported.filter((r) => r !== told);
      return told?.remote;
    },
    forget(endpoint) {
      reported = reported.filter((r) => r.source.endpoint !== endpoint);
    },
  };
}

interface Wiring {
  readonly conference: JitsiConference;
  readonly hooks: ConferenceHooks;
  readonly roster: Roster;
  readonly reports: ReturnType<typeof createReports>;
  readonly reported: ReturnType<typeof createReported>;
  /** The track event for a video's type, and the tracks listened to. */
  readonly retyped: string | undefined;
  readonly watched: WeakSet<JitsiTrack>;
}

/** A newer endpoint of someone present: they left, and joined again. */
function joinOf(w: Wiring) {
  return (endpoint: string, participant: JitsiParticipant): void => {
    const joined = w.roster.join(endpoint, participant);
    if (!joined) return;
    const { id, replaced } = joined;
    for (const old of replaced) {
      w.reported.forget(old);
      w.hooks.onTrackGone({ endpoint: old });
    }
    if (replaced.length > 0)
      w.reports.later(() => {
        w.hooks.emitter.emit("participantLeft", id);
      });
    w.reports.later(() => {
      w.hooks.emitter.emit("participantJoined", id);
    });
  };
}

function leaveOf(w: Wiring) {
  return (endpoint: string): void => {
    w.reported.forget(endpoint);
    w.hooks.onTrackGone({ endpoint });
    const id = w.roster.leave(endpoint);
    if (id)
      w.reports.later(() => {
        w.hooks.emitter.emit("participantLeft", id);
      });
  };
}

/** Takes back what was told of a source, if anything was. */
function takeBack(w: Wiring, source: BridgeSource): void {
  const remote = w.reported.remove(source);
  if (!remote) return;
  w.hooks.onTrackGone(source);
  w.reports.later(() => {
    w.hooks.emitter.emit("trackRemoved", remote);
  });
}

/** Tells of a source's track, unless it was told already. */
function tell(w: Wiring, source: BridgeSource, t: JitsiTrack): void {
  const id = w.roster.idOf(source.endpoint);
  if (!id) return;
  const remote = remoteTrack(id, t);
  if (!w.reported.add(source, remote)) return;
  w.hooks.onTrack(source, t.getType(), remote);
  w.reports.later(() => {
    w.hooks.emitter.emit("trackAdded", remote);
  });
}

type TrackChange = "trackAdded" | "trackRemoved" | "muted" | "retyped";

/**
 * A remote track of a vouched participant, after their join. A video
 * its sender took away stays in the conference, signalled as muted (the
 * library keeps the source for the next one): that is its end here, and
 * its unmuting a new start. A microphone's mute is the core's own
 * signal, and its track stays. The library can learn that a video is a
 * share after telling of it: it is then told again, as the share.
 */
function trackOf(w: Wiring, name: TrackChange) {
  const join = joinOf(w);
  const retyped = (t: JitsiTrack) => (): void => {
    trackOf(w, "retyped")(t);
  };
  return (t: JitsiTrack): void => {
    if (t.isLocal()) return;
    const video = t.getType() === "video";
    if (name === "muted" && !video) return;
    const endpoint = t.getParticipantId();
    const participant = w.conference.getParticipantById(endpoint);
    if (name === "trackAdded" && participant) join(endpoint, participant);
    if (name === "trackAdded" && video && w.retyped && !w.watched.has(t)) {
      w.watched.add(t);
      t.on(w.retyped, retyped(t));
    }
    const source = { endpoint, sourceName: t.getSourceName() };
    const told = w.reported.find(source);
    if (name === "retyped" && (!told || told.source === sourceOf(t))) return;
    const present = name !== "trackRemoved" && !(video && t.isMuted());
    if (!present || name === "retyped") takeBack(w, source);
    if (present) tell(w, source, t);
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
    reported: createReported(),
    retyped: sdk.events.track?.TRACK_VIDEOTYPE_CHANGED,
    watched: new WeakSet(),
  };
  const events = sdk.events.conference;
  const on = (event: string | undefined, listener: Listener): void => {
    if (event) conference.on(event, listener);
  };
  on(events.USER_JOINED, joinOf(w));
  on(events.USER_LEFT, leaveOf(w));
  on(events.TRACK_ADDED, trackOf(w, "trackAdded"));
  on(events.TRACK_REMOVED, trackOf(w, "trackRemoved"));
  on(events.TRACK_MUTE_CHANGED, trackOf(w, "muted"));
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
