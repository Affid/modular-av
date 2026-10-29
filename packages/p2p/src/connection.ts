import type {
  ConnectionStats,
  ServiceCapabilities,
  ServiceConnection,
  ServiceConnectionState,
  ServiceContext,
  ServiceError,
  TrackSource,
} from "@modular-av/api";
import {
  type Live,
  type MeshHooks,
  openMesh,
  type P2PConnectionDeps,
} from "./connection-mesh.ts";
import { createEmitter, type Emitter } from "./emitter.ts";
import { P2PServiceError } from "./failure.ts";
import type { OutgoingSource } from "./link.ts";
import { isOverCap } from "./roster.ts";

export {
  HELLO_AGAIN_MS,
  type P2PConnectionDeps,
  STATS_EVERY_MS,
} from "./connection-mesh.ts";

/** How long a joining player listens for the others before counting them. */
export const DISCOVERY_MS = 1_000;
/** Resuming this long (links down, none up) gives up: the core reconnects. */
export const LOST_AFTER_MS = 30_000;

const CAPABILITIES: ServiceCapabilities = {
  speakingDetection: false,
};

const FULL: ServiceError = { code: "full", final: true };
const DUPLICATE: ServiceError = { code: "duplicate", final: true };
const NETWORK: ServiceError = { code: "network", final: false };

const isOutgoing = (source: TrackSource): source is OutgoingSource =>
  source === "microphone" || source === "camera";

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

/** One connection's state; fields are replaced, never changed in place. */
interface Fields {
  readonly context: ServiceContext;
  readonly deps: P2PConnectionDeps;
  readonly events: Emitter;
  state: ServiceConnectionState;
  live: Live | null;
  published: ReadonlyMap<OutgoingSource, string>;
  lastStats: ConnectionStats;
  yieldedWhileJoining: boolean;
}

function setState(
  c: Fields,
  next: ServiceConnectionState,
  error?: ServiceError,
): void {
  c.state = next;
  if (error) c.events.emit("state", next, error);
  else c.events.emit("state", next);
}

/** Says goodbye and closes every link; the tracks stay the core's. */
function leave(c: Fields): void {
  const ending = c.live;
  c.live = null;
  if (!ending) return;
  for (const timer of ending.timers) clearTimeout(timer);
  ending.health.stop();
  for (const off of ending.offs) off();
  ending.mesh.bye();
  ending.mesh.close();
}

const up = (c: Fields): boolean =>
  c.state === "connected" || c.state === "resuming";

/** Ends for good once; the core decides whether to come back. */
function end(
  c: Fields,
  endState: "failed" | "lost",
  error: ServiceError,
): void {
  if (!c.live || !up(c)) return;
  leave(c);
  setState(c, endState, error);
}

function hooksFor(c: Fields): MeshHooks {
  return {
    onYield: () => {
      if (c.state === "connecting") c.yieldedWhileJoining = true;
      else end(c, "failed", DUPLICATE);
    },
    onChange: () => {
      const current = c.live;
      if (!current || !up(c)) return;
      if (isOverCap(current.mesh.roster, c.deps.maxParticipants(), c.deps.isGM))
        end(c, "failed", FULL);
      else current.health.update(current.mesh.linkStates());
    },
    health: {
      lostAfterMs: LOST_AFTER_MS,
      onResuming: () => {
        setState(c, "resuming");
      },
      onRecovered: () => {
        setState(c, "connected");
      },
      onLost: () => {
        end(c, "lost", NETWORK);
      },
    },
    onStats: (stats) => {
      c.lastStats = stats;
    },
  };
}

/** Read through a call: a message can set it while joining waits. */
const yielded = (c: Fields): boolean => c.yieldedWhileJoining;

/** Listens for the others a moment, then counts them against the cap. */
async function join(
  c: Fields,
  room: string,
  signal: AbortSignal,
): Promise<void> {
  c.state = "connecting";
  c.yieldedWhileJoining = false;
  const opened = openMesh(room, c.context, c.deps, c.events, hooksFor(c));
  c.live = opened;
  try {
    opened.mesh.hello();
    await pause(DISCOVERY_MS, signal);
  } catch (error: unknown) {
    leave(c);
    c.state = "disconnected";
    throw error;
  }
  const { roster } = opened.mesh;
  const over = isOverCap(roster, c.deps.maxParticipants(), c.deps.isGM);
  const refusal = yielded(c) ? DUPLICATE : over ? FULL : null;
  if (refusal) {
    leave(c);
    c.state = "failed";
    throw new P2PServiceError(refusal);
  }
  setState(c, "connected");
  opened.health.update(opened.mesh.linkStates());
}

type Publishing = Pick<
  ServiceConnection,
  "publish" | "replaceTrack" | "unpublish" | "setMuted" | "setSubscription"
>;

/** The core's tracks go to every link; they are never stopped here. */
function publishing(c: Fields): Publishing {
  const current = (source: TrackSource, id: string): source is OutgoingSource =>
    isOutgoing(source) && c.published.get(source) === id;
  return {
    async publish(track, source) {
      if (!isOutgoing(source))
        throw new Error(`The P2P service can't send ${source} yet`);
      const id = c.deps.randomId();
      c.published = new Map(c.published).set(source, id);
      await c.live?.mesh.setTrack(source, track);
      return { id, source };
    },
    async replaceTrack(item, track) {
      if (current(item.source, item.id))
        await c.live?.mesh.setTrack(item.source, track);
    },
    async unpublish(item) {
      if (!current(item.source, item.id)) return;
      const next = new Map(c.published);
      next.delete(item.source);
      c.published = next;
      await c.live?.mesh.setTrack(item.source, null);
    },
    /** The core's disabled track already sends silence or black. */
    setMuted: () => Promise.resolve(),
    setSubscription(participant, source, options) {
      c.live?.mesh.setRefused(participant, source, !options.enabled);
    },
  };
}

/** The core's view of the call; every link lives in the mesh. */
export function createP2PConnection(
  context: ServiceContext,
  deps: P2PConnectionDeps,
): ServiceConnection {
  const c: Fields = {
    context,
    deps,
    events: createEmitter(deps.onError),
    state: "idle",
    live: null,
    published: new Map(),
    lastStats: {},
    yieldedWhileJoining: false,
  };
  return {
    capabilities: { get: () => CAPABILITIES, subscribe: () => () => undefined },
    async connect(room, _token, signal) {
      if (c.live) throw new Error("The P2P service is already connected");
      if (signal.aborted) throw aborted();
      await join(c, room.name, signal);
    },
    async disconnect() {
      const was = c.live;
      leave(c);
      await Promise.resolve();
      if (was) setState(c, "disconnected");
    },
    ...publishing(c),
    on: (event, handler) => c.events.on(event, handler),
    getStats: () => Promise.resolve(c.lastStats),
    getParticipantStats(participant) {
      const stats = c.live?.mesh.participantStats(participant) ?? null;
      return stats
        ? Promise.resolve(stats)
        : Promise.reject(new Error(`${participant} is not linked yet`));
    },
  };
}
