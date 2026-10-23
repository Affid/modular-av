import type {
  MediaPermissions,
  ParticipantId,
  ServiceCapabilities,
  ServiceConnection,
  SessionState,
} from "@modular-av/api";

/**
 * The core's own facts that Foundry doesn't hold, shared by the call, the
 * state sync and the controller. Fields are replaced, never mutated in
 * place, so a reader always sees a consistent value.
 */
export interface Runtime {
  /** Foundry's broadcast intent: push to talk held, or voice detected. */
  intent: boolean;
  deafened: boolean;
  /** `AVMaster` connected the client class (A/V is enabled). */
  foundryConnected: boolean;
  session: SessionState;
  connection: ServiceConnection | null;
  capabilities: ServiceCapabilities | null;
  connected: ReadonlySet<ParticipantId>;
  speaking: ReadonlyMap<ParticipantId, boolean>;
  /** The local player's rights when last applied: a change needs a new token. */
  rights: MediaPermissions | null;
}

export const IDLE_SESSION: SessionState = {
  status: "idle",
  attempt: 0,
  nextRetryAt: null,
  reason: null,
};

export function createRuntime(deafened: boolean): Runtime {
  return {
    intent: false,
    deafened,
    foundryConnected: false,
    session: IDLE_SESSION,
    connection: null,
    capabilities: null,
    connected: new Set(),
    speaking: new Map(),
    rights: null,
  };
}
