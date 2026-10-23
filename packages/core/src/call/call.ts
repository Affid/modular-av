import type {
  MediaPermissions,
  ParticipantId,
  ServiceConnection,
  ServiceDefinition,
  TokenRequest,
} from "@modular-av/api";
import { createTokenRelay, type TokenRelay } from "../auth/relay.ts";
import { AV_MODES, type AVFacts } from "../foundry/av-facts.ts";
import type {
  FoundryGame,
  FoundryHooks,
  FoundryUser,
} from "../foundry/globals.ts";
import type { MediaEnv } from "../media/env.ts";
import type { LocalMedia } from "../media/local-media.ts";
import type { RemoteMedia } from "../media/remote-media.ts";
import { createSession, type Session } from "../session/session.ts";
import type { Channels } from "../socket.ts";
import type { Runtime } from "./runtime.ts";

/** Join tokens are only used to join: LiveKit refreshes them while connected. */
export const TOKEN_TTL_SECONDS = 600;

export interface CallDeps {
  readonly game: FoundryGame;
  readonly hooks: FoundryHooks;
  readonly env: MediaEnv;
  readonly channels: Channels;
  readonly facts: AVFacts;
  readonly rt: Runtime;
  readonly local: LocalMedia;
  readonly remote: RemoteMedia;
  readonly service: () => ServiceDefinition | undefined;
  readonly outbound: () => MediaPermissions;
  readonly refreshState: () => void;
  readonly renderDock: () => void;
  readonly onError: (error: unknown) => void;
  readonly now: () => number;
  readonly randomId: () => string;
}

/** What a GM signs for `participant`: rights from Foundry's server data. */
export function tokenRequestFor(
  game: FoundryGame,
  facts: AVFacts,
  participant: ParticipantId,
): TokenRequest | null {
  if (facts.mode() === AV_MODES.DISABLED) return null;
  if (!game.users.get(participant)?.active) return null;
  return {
    participant,
    room: game.world.id,
    canPublish: facts.canBroadcast(participant),
    ttlSeconds: TOKEN_TTL_SECONDS,
  };
}

function createRelay(
  deps: CallDeps,
  onWaitingForGm: (waiting: boolean) => void,
): TokenRelay {
  const { game, hooks, facts } = deps;
  return createTokenRelay({
    channel: deps.channels.channel("auth"),
    selfId: facts.selfId,
    isGM: (id) => game.users.get(id)?.isGM ?? false,
    onlineGms: () =>
      game.users.contents.filter((u) => u.active && u.isGM).map((u) => u.id),
    service: deps.service,
    tokenRequestFor: (participant) => tokenRequestFor(game, facts, participant),
    onWaitingForGm,
    onGmConnected: (listener) => {
      const id = hooks.on("userConnected", (user: FoundryUser, on: boolean) => {
        if (on && user.isGM) listener();
      });
      return () => {
        hooks.off("userConnected", id);
      };
    },
    onSignError: deps.onError,
    randomId: deps.randomId,
    now: deps.now,
  });
}

/** Keeps the runtime in step with the live connection, or its absence. */
function connectionTracker(
  deps: CallDeps,
): (connection: ServiceConnection | null) => void {
  const { rt, remote } = deps;
  let unsubscribe = (): void => undefined;
  return (connection) => {
    unsubscribe();
    rt.connection = connection;
    rt.capabilities = connection?.capabilities.get() ?? null;
    unsubscribe =
      connection?.capabilities.subscribe((capabilities) => {
        rt.capabilities = capabilities;
        deps.refreshState();
      }) ?? (() => undefined);
    if (!connection) {
      rt.connected = new Set();
      rt.speaking = new Map();
      remote.clear();
      deps.renderDock();
    }
    deps.refreshState();
  };
}

/** The session, its token relay and the service's remote events. */
export function createCall(deps: CallDeps): Session {
  const { game, facts, rt, local, remote } = deps;
  // The relay reports through the session, the one owner of its status.
  let session: Session | null = null;
  const relay = createRelay(deps, (waiting) => {
    session?.waitingForGm(waiting);
  });
  session = createSession({
    participant: facts.selfId,
    service: deps.service,
    room: () => ({ name: game.world.id }),
    requestToken: (signal) => relay.request(signal),
    localTracks: () => ({ microphone: local.microphone, camera: local.camera }),
    canPublish: () => facts.canBroadcast(facts.selfId),
    outbound: deps.outbound,
    afterMediaSync: () => {
      local.setOutbound(deps.outbound());
    },
    onState: (state) => {
      rt.session = state;
      deps.refreshState();
    },
    onConnection: connectionTracker(deps),
    remote: {
      trackAdded: (track) => {
        if (track.participant !== facts.selfId) remote.add(track);
      },
      trackRemoved: (track) => {
        remote.remove(track);
      },
      participantJoined: (id) => {
        rt.connected = new Set([...rt.connected, id]);
        deps.refreshState();
        deps.renderDock();
      },
      participantLeft: (id) => {
        rt.connected = new Set([...rt.connected].filter((p) => p !== id));
        rt.speaking = new Map([...rt.speaking].filter(([p]) => p !== id));
        remote.removeParticipant(id);
        deps.renderDock();
      },
      speaking: (id, speaking) => {
        rt.speaking = new Map(rt.speaking).set(id, speaking);
        deps.refreshState();
      },
    },
    onOnline: (listener) => deps.env.onOnline(listener),
    now: deps.now,
    onError: deps.onError,
  });
  return session;
}
