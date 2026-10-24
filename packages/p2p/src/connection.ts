import type {
  Channel,
  ConnectionStats,
  ParticipantId,
  ServiceCapabilities,
  ServiceConnection,
  ServiceConnectionState,
  ServiceContext,
  ServiceError,
  TrackSource,
} from "@modular-av/api";
import { createEmitter, type Emitter } from "./emitter.ts";
import { P2PServiceError } from "./failure.ts";
import { createHealth, type Health, type HealthDeps } from "./health.ts";
import type { OutgoingSource } from "./link.ts";
import { createMesh, type Mesh } from "./mesh.ts";
import type { CreatePeerConnection } from "./peer.ts";
import { isOverCap } from "./roster.ts";
import { createSignalling } from "./signalling.ts";

/** How long a joining player listens for the others before counting them. */
export const DISCOVERY_MS = 1_000;
/** Resuming this long (links down, none up) gives up: the core reconnects. */
export const LOST_AFTER_MS = 30_000;
/** How often connected links are rated: well under once a second. */
export const STATS_EVERY_MS = 5_000;
/**
 * When a joining player says hello again: Foundry loses some messages to a
 * page that just loaded, and a hello the others know brings a new welcome.
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
  readonly isUser: (user: ParticipantId) => boolean;
  readonly isGM: (user: ParticipantId) => boolean;
  readonly maxParticipants: () => number;
  /** When this page first joined: a reconnect keeps its place in the call. */
  readonly joinedAt: () => number;
  readonly now: () => number;
  readonly randomId: () => string;
  readonly onError: (error: unknown) => void;
}

const CAPABILITIES: ServiceCapabilities = {
  moderation: false,
  speakingDetection: false,
  simulcast: false,
};

const FULL: ServiceError = { code: "full", final: true };
const DUPLICATE: ServiceError = { code: "duplicate", final: true };
const NETWORK: ServiceError = { code: "network", final: false };

const isOutgoing = (source: TrackSource): source is OutgoingSource =>
  source === "microphone" || source === "camera";

interface Live {
  readonly mesh: Mesh;
  readonly health: Health;
  readonly offs: readonly (() => void)[];
  readonly timers: readonly ReturnType<typeof setTimeout>[];
}

interface MeshHooks {
  readonly onYield: () => void;
  readonly onChange: () => void;
  readonly health: HealthDeps;
  readonly onStats: (stats: ConnectionStats) => void;
}

const aborted = (): DOMException =>
  new DOMException("The connection attempt was aborted", "AbortError");

/** Waits `ms`, or rejects once `signal` is aborted. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** The core's view of the call; every link lives in the mesh. */
export function createP2PConnection(
  context: ServiceContext,
  deps: P2PConnectionDeps,
): ServiceConnection {
  const emitter = createEmitter(deps.onError);
  let state: ServiceConnectionState = "idle";
  let live: Live | null = null;
  let published = new Map<OutgoingSource, string>();
  let lastStats: ConnectionStats = {};
  let yieldedWhileJoining = false;
  /** Read through a call: a message can set it while joining waits. */
  const yielded = (): boolean => yieldedWhileJoining;

  const setState = (
    next: ServiceConnectionState,
    error?: ServiceError,
  ): void => {
    state = next;
    if (error) emitter.emit("state", next, error);
    else emitter.emit("state", next);
  };

  /** Says goodbye and closes every link; the tracks stay the core's. */
  const leave = (): void => {
    const ending = live;
    live = null;
    if (!ending) return;
    for (const timer of ending.timers) clearTimeout(timer);
    ending.health.stop();
    for (const off of ending.offs) off();
    ending.mesh.bye();
    ending.mesh.close();
  };

  const up = (): boolean => state === "connected" || state === "resuming";

  /** Ends for good once; the core decides whether to come back. */
  const end = (endState: "failed" | "lost", error: ServiceError): void => {
    if (!live || !up()) return;
    leave();
    setState(endState, error);
  };

  const hooks: MeshHooks = {
    onYield: () => {
      if (state === "connecting") yieldedWhileJoining = true;
      else end("failed", DUPLICATE);
    },
    onChange: () => {
      const current = live;
      if (!current || !up()) return;
      if (isOverCap(current.mesh.roster, deps.maxParticipants(), deps.isGM))
        end("failed", FULL);
      else current.health.update(current.mesh.linkStates());
    },
    health: {
      lostAfterMs: LOST_AFTER_MS,
      onResuming: () => {
        setState("resuming");
      },
      onRecovered: () => {
        setState("connected");
      },
      onLost: () => {
        end("lost", NETWORK);
      },
    },
    onStats: (stats) => {
      lastStats = stats;
    },
  };

  /** Listens for the others a moment, then counts them against the cap. */
  const join = async (room: string, signal: AbortSignal): Promise<void> => {
    state = "connecting";
    yieldedWhileJoining = false;
    const opened = openMesh(room, context, deps, emitter, hooks);
    live = opened;
    try {
      opened.mesh.hello();
      await pause(DISCOVERY_MS, signal);
    } catch (error: unknown) {
      leave();
      state = "disconnected";
      throw error;
    }
    const over = isOverCap(
      opened.mesh.roster,
      deps.maxParticipants(),
      deps.isGM,
    );
    const refusal = yielded() ? DUPLICATE : over ? FULL : null;
    if (refusal) {
      leave();
      state = "failed";
      throw new P2PServiceError(refusal);
    }
    setState("connected");
    opened.health.update(opened.mesh.linkStates());
  };

  return {
    capabilities: { get: () => CAPABILITIES, subscribe: () => () => undefined },
    async connect(room, _token, signal) {
      if (live) throw new Error("The P2P service is already connected");
      if (signal.aborted) throw aborted();
      await join(room.name, signal);
    },
    async disconnect() {
      const was = live;
      leave();
      await Promise.resolve();
      if (was) setState("disconnected");
    },
    async publish(track, source) {
      if (!isOutgoing(source))
        throw new Error(`The P2P service can't send ${source} yet`);
      const id = deps.randomId();
      published = new Map(published).set(source, id);
      await live?.mesh.setTrack(source, track);
      return { id, source };
    },
    async replaceTrack(item, track) {
      if (!isOutgoing(item.source) || published.get(item.source) !== item.id)
        return;
      await live?.mesh.setTrack(item.source, track);
    },
    async unpublish(item) {
      if (!isOutgoing(item.source) || published.get(item.source) !== item.id)
        return;
      const next = new Map(published);
      next.delete(item.source);
      published = next;
      await live?.mesh.setTrack(item.source, null);
    },
    /** The core's disabled track already sends silence or black. */
    setMuted: () => Promise.resolve(),
    setSubscription(participant, source, options) {
      live?.mesh.setRefused(participant, source, !options.enabled);
    },
    on: (event, handler) => emitter.on(event, handler),
    getStats: () => Promise.resolve(lastStats),
  };
}

/** A fresh session: its signalling, links, health and the Foundry hooks. */
function openMesh(
  room: string,
  context: ServiceContext,
  deps: P2PConnectionDeps,
  emitter: Emitter,
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
      deps.onError(new Error(`Dropped a signalling message from ${user}`));
    },
  });
  const mesh = createMesh({
    self: { user: context.participant, session, joinedAt: deps.joinedAt() },
    signalling,
    createPeerConnection: () =>
      deps.createPeerConnection(deps.iceConfiguration()),
    events: emitter,
    now: deps.now,
    onYield: hooks.onYield,
    onChange: hooks.onChange,
    onError: deps.onError,
  });
  const offs = [
    signalling.listen((signal, user) => {
      mesh.handle(signal, user);
    }),
    deps.onIceChange(() => {
      mesh.setConfiguration(deps.iceConfiguration());
    }),
    deps.onUserLeft((user) => {
      mesh.userLeft(user);
    }),
  ];
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
  return { mesh, health: createHealth(hooks.health), offs, timers };
}
