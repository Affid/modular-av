import type {
  Channel,
  ConnectionStats,
  ParticipantId,
  ServiceContext,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import { createHealth, type Health, type HealthDeps } from "./health.ts";
import { createMesh, type Mesh } from "./mesh.ts";
import type { CreatePeerConnection } from "./peer.ts";
import { createSignalling } from "./signalling.ts";

/** How often connected links are rated: well under once a second. */
export const STATS_EVERY_MS = 5_000;
/**
 * When a joining player says hello again: a page that just loaded may read
 * replies late, and messages can be lost while Foundry's socket reconnects.
 */
export const HELLO_AGAIN_MS: readonly number[] = [2_000, 6_000, 15_000];

export interface P2PConnectionDeps {
  readonly channel: Channel;
  readonly createPeerConnection: CreatePeerConnection;
  readonly iceConfiguration: () => RTCConfiguration;
  /** Foundry's TURN setting or the module's STUN servers changed. */
  readonly onIceChange: (listener: () => void) => () => void;
  /** Foundry says a user's last tab went away. */
  readonly onUserLeft: (listener: (user: ParticipantId) => void) => () => void;
  /** Foundry's socket connected again: what it sent meanwhile is lost. */
  readonly onReconnect: (listener: () => void) => () => void;
  readonly isUser: (user: ParticipantId) => boolean;
  readonly isGM: (user: ParticipantId) => boolean;
  readonly maxParticipants: () => number;
  /** When this page first joined: a reconnect keeps its place in the call. */
  readonly joinedAt: () => number;
  readonly now: () => number;
  readonly randomId: () => string;
  readonly onError: (error: unknown) => void;
}

export interface MeshHooks {
  readonly onYield: () => void;
  readonly onChange: () => void;
  readonly health: HealthDeps;
  readonly onStats: (stats: ConnectionStats) => void;
}

/** One session in the call: its mesh, health, hooks and timers. */
export interface Live {
  readonly mesh: Mesh;
  readonly health: Health;
  readonly offs: readonly (() => void)[];
  readonly timers: readonly ReturnType<typeof setTimeout>[];
}

/** Foundry's events the mesh follows, undone when the session ends. */
function follow(deps: P2PConnectionDeps, mesh: Mesh): (() => void)[] {
  return [
    deps.onIceChange(() => {
      mesh.setConfiguration(deps.iceConfiguration());
    }),
    deps.onUserLeft((user) => {
      mesh.userLeft(user);
    }),
    deps.onReconnect(() => {
      mesh.resync();
    }),
  ];
}

/** A fresh session: its signalling, links, health and the Foundry hooks. */
export function openMesh(
  room: string,
  context: ServiceContext,
  deps: P2PConnectionDeps,
  events: Emitter,
  hooks: MeshHooks,
): Live {
  const session = deps.randomId();
  const signalling = createSignalling({
    channel: deps.channel,
    room,
    session,
    isUser: deps.isUser,
    now: deps.now,
    onDropped: (user) => {
      deps.onError(new Error(`Dropped signalling messages from ${user}`));
    },
  });
  const mesh = createMesh({
    self: { user: context.participant, session, joinedAt: deps.joinedAt() },
    signalling,
    createPeerConnection: () =>
      deps.createPeerConnection(deps.iceConfiguration()),
    events,
    now: deps.now,
    onYield: hooks.onYield,
    onChange: hooks.onChange,
    onError: deps.onError,
  });
  const listening = signalling.listen((signal, user) => {
    mesh.handle(signal, user);
  });
  const timers = [
    setInterval(() => {
      mesh.sampleStats().then(hooks.onStats, deps.onError);
    }, STATS_EVERY_MS),
    ...HELLO_AGAIN_MS.map((ms) =>
      setTimeout(() => {
        mesh.hello();
      }, ms),
    ),
  ];
  const offs = [listening, ...follow(deps, mesh)];
  return { mesh, health: createHealth(hooks.health), offs, timers };
}
