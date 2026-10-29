import type {
  ParticipantId,
  RoomSpec,
  ServiceCapabilities,
  ServiceConnection,
  ServiceContext,
  ServiceError,
} from "@modular-av/api";
import {
  type ConferenceHooks,
  wireConference,
  type WiredConference,
} from "./conference-events.ts";
import { createEmitter, type Emitter } from "./emitter.ts";
import {
  type Attempt,
  fromConnectionError,
  JitsiServiceError,
  NETWORK,
} from "./errors.ts";
import { joinConference, type JitsiServer, openConnection } from "./join.ts";
import { createLocalTracks, type LocalTracks } from "./local-tracks.ts";
import type {
  JitsiConference,
  JitsiConnection,
  JitsiMeetJS,
} from "./sdk-types.ts";
import { createStatsCache, type StatsCache } from "./stats.ts";
import { createSubscriptions, type Subscriptions } from "./subscriptions.ts";
import { createTokenRefresh, type TokenRefresh } from "./token-refresh.ts";
import { jitsiRoomName } from "./token.ts";

/** Loaded with `import()` only when a call starts, with the SDK loaded. */
export interface JitsiConnectionOptions {
  readonly sdk: JitsiMeetJS;
  readonly server: JitsiServer;
  readonly now: () => number;
  readonly onError: (error: unknown) => void;
}

/**
 * Speaking comes from each sender's own gate over Foundry (Jitsi names
 * one dominant speaker only); no moderation (receivers enforce blocks).
 */
const CAPABILITIES: ServiceCapabilities = {
  speakingDetection: false,
  features: [],
};

const capabilities: ServiceConnection["capabilities"] = {
  get: () => CAPABILITIES,
  subscribe: () => () => undefined,
};

const MODERATOR =
  "The Jitsi server made this player a moderator: a modified client could mute or remove others. See the module's README (token_affiliation, ENABLE_AUTO_OWNER=0, JICOFO_ENABLE_AUTH=0).";

const UNVOUCHED =
  "A participant in the Jitsi room has no identity from the server: is Prosody's presence_identity module enabled on its main VirtualHost?";

/** One connection's moving parts, shared by the functions below. */
interface Live {
  readonly self: ParticipantId;
  readonly options: JitsiConnectionOptions;
  readonly emitter: Emitter;
  readonly local: LocalTracks;
  readonly subscriptions: Subscriptions;
  readonly refresh: TokenRefresh;
  /** Aborts a join under way when the connection ends or is left. */
  readonly closing: AbortController;
  connection: JitsiConnection | null;
  conference: JitsiConference | null;
  wired: WiredConference | null;
  stats: StatsCache | null;
  attempt: Attempt;
  leaving: boolean;
  ended: boolean;
  /** Leaving runs once per connection. */
  left: Promise<void> | null;
}

const isClosed = (live: Live): boolean => live.leaving || live.ended;

async function leaveOnce(live: Live): Promise<void> {
  const { conference, connection, options } = live;
  live.conference = null;
  live.connection = null;
  live.refresh.cancel();
  await live.local.releaseAll().catch(options.onError);
  await conference?.leave().catch(options.onError);
  await connection?.disconnect().catch(options.onError);
}

function leave(live: Live): Promise<void> {
  live.left ??= leaveOnce(live);
  return live.left;
}

/** Reports the end once (never after leaving on purpose) and leaves. */
function end(live: Live, error: ServiceError): void {
  if (isClosed(live)) return;
  live.ended = true;
  live.closing.abort(new JitsiServiceError(error));
  live.emitter.emit("state", error.final ? "failed" : "lost", error);
  void leave(live);
}

function hooksFor(live: Live): ConferenceHooks {
  return {
    self: live.self,
    emitter: live.emitter,
    attempt: () => live.attempt,
    closed: () => isClosed(live),
    onUnvouched: () => {
      live.options.onError(new Error(UNVOUCHED));
    },
    onDuplicate: () => {
      end(live, {
        code: "duplicate",
        final: true,
        message: "Joined from another tab or window",
      });
    },
    onEnd: (error) => {
      end(live, error);
    },
    onTrack: (source, kind, remote) => {
      live.subscriptions.track(source, kind, remote);
    },
    onTrackGone: (source) => {
      live.subscriptions.remove(source);
    },
  };
}

function wire(live: Live, conference: JitsiConference): void {
  const wired = wireConference(live.options.sdk, conference, hooksFor(live));
  live.wired = wired;
  live.stats = createStatsCache(live.options.sdk, conference, (participant) =>
    wired.roster.endpointOf(participant),
  );
}

/** After it opened: a drop, a failure (e.g. the shard changed), a token. */
function watchConnection(live: Live, connection: JitsiConnection): void {
  const events = live.options.sdk.events.connection;
  const on = (
    event: string | undefined,
    listener: (error: string) => void,
  ): void => {
    if (event) connection.addEventListener(event, listener);
  };
  on(events.CONNECTION_DISCONNECTED, () => {
    end(live, NETWORK);
  });
  on(events.CONNECTION_FAILED, (error) => {
    end(live, fromConnectionError(error, live.attempt));
  });
  on(events.CONNECTION_TOKEN_EXPIRED, () => {
    live.refresh.expired();
  });
}

/** Gives up a join that ended meanwhile: with the end's reason, or as aborted. */
function stopIfClosed(live: Live): void {
  const reason: unknown = live.closing.signal.reason;
  if (reason instanceof JitsiServiceError) throw reason;
  if (isClosed(live))
    throw new DOMException("The connection attempt was aborted", "AbortError");
}

async function joinLive(
  live: Live,
  connection: JitsiConnection,
  room: RoomSpec,
  signal: AbortSignal,
): Promise<void> {
  try {
    live.conference = await joinConference(
      live.options.sdk,
      connection,
      jitsiRoomName(room.name),
      live.attempt,
      signal,
      (conference) => {
        wire(live, conference);
      },
    );
    stopIfClosed(live);
  } catch (error: unknown) {
    live.leaving = true;
    await leave(live);
    throw error;
  }
}

async function connectLive(
  live: Live,
  room: RoomSpec,
  token: string,
  callerSignal: AbortSignal,
): Promise<void> {
  const { sdk, server, now } = live.options;
  const signal = AbortSignal.any([callerSignal, live.closing.signal]);
  live.attempt = { token, now: now() };
  const connection = await openConnection(sdk, server, live.attempt, signal);
  live.connection = connection;
  watchConnection(live, connection);
  await joinLive(live, connection, room, signal);
  live.wired?.start();
  if (live.conference?.isModerator())
    live.options.onError(new Error(MODERATOR));
  live.emitter.emit("state", "connected");
}

function createLive(
  context: ServiceContext,
  options: JitsiConnectionOptions,
): Live {
  const emitter = createEmitter(options.onError);
  const live: Live = {
    self: context.participant,
    options,
    emitter,
    local: createLocalTracks(options.sdk, () => live.conference),
    subscriptions: createSubscriptions(() => live.conference),
    refresh: createTokenRefresh(
      () => live.connection,
      emitter,
      (error) => {
        end(live, error);
      },
      options.onError,
    ),
    closing: new AbortController(),
    connection: null,
    conference: null,
    wired: null,
    stats: null,
    attempt: { token: "", now: 0 },
    leaving: false,
    ended: false,
    left: null,
  };
  return live;
}

export function createJitsiConnection(
  context: ServiceContext,
  options: JitsiConnectionOptions,
): ServiceConnection {
  const live = createLive(context, options);
  return {
    capabilities,
    async connect(room, token, signal) {
      if (token === null)
        throw new JitsiServiceError({
          code: "auth",
          final: true,
          message: "Jitsi needs a join token",
        });
      await connectLive(live, room, token, signal);
    },
    async disconnect() {
      live.leaving = true;
      live.closing.abort();
      await leave(live);
      live.emitter.emit("state", "disconnected");
    },
    publish: (track, source) => live.local.publish(track, source),
    replaceTrack: (published, track) => live.local.replace(published, track),
    unpublish: (published) => live.local.unpublish(published),
    setMuted: (published, muted) => live.local.setMuted(published, muted),
    setSubscription(participant, source, subscription) {
      live.subscriptions.set(participant, source, subscription);
    },
    updateToken: (token) => {
      live.attempt = { token, now: options.now() };
      return live.refresh.update(token);
    },
    on: (event, handler) => live.emitter.on(event, handler),
    getStats: () => Promise.resolve(live.stats?.own() ?? {}),
    getParticipantStats(participant) {
      const stats = live.stats?.of(participant);
      return stats
        ? Promise.resolve(stats)
        : Promise.reject(new Error(`No measurements of ${participant} yet`));
    },
  };
}
