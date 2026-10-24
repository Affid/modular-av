import type {
  ConnectionStats,
  ParticipantId,
  ServiceConnection,
  Stats,
} from "@modular-av/api";
import { AVCommandError } from "../errors.ts";

/** A UI polling faster than this gets the same answer: services aren't hammered. */
export const STATS_FRESH_MS = 1000;

export interface StatsDeps {
  /** The live connection, or null outside a call. */
  connection(): ServiceConnection | null;
  /** Who is in the call, this client included. */
  inCall(): readonly ParticipantId[];
  now(): number;
}

interface Cached {
  readonly connection: ServiceConnection;
  readonly at: number;
  readonly value: Promise<ConnectionStats>;
}

function read(
  connection: ServiceConnection,
  participant: ParticipantId | null,
): Promise<ConnectionStats> {
  if (participant === null) return connection.getStats();
  if (!connection.getParticipantStats)
    throw new AVCommandError(
      "unsupported",
      "This service doesn't tell connection details per player",
    );
  return connection.getParticipantStats(participant);
}

export function createStats(deps: StatsDeps): Stats {
  let cache = new Map<string, Cached>();

  const get = (participant: ParticipantId | null): Promise<ConnectionStats> => {
    const connection = deps.connection();
    if (!connection)
      throw new AVCommandError("not-ready", "Not in a voice and video call");
    if (participant !== null && !deps.inCall().includes(participant))
      throw new AVCommandError("unknown-participant", "Not in the call", {
        participant,
      });
    const key = participant ?? "";
    const cached = cache.get(key);
    const now = deps.now();
    if (cached?.connection === connection && now - cached.at < STATS_FRESH_MS)
      return cached.value;
    const value = read(connection, participant);
    cache = new Map(cache).set(key, { connection, at: now, value });
    value.catch(() => {
      if (cache.get(key)?.value !== value) return;
      const next = new Map(cache);
      next.delete(key);
      cache = next;
    });
    return value;
  };

  return Object.freeze({
    get(participant: ParticipantId | null) {
      try {
        return get(participant);
      } catch (error: unknown) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  });
}
