import type { ServiceError } from "@modular-av/api";
import type { Emitter } from "./emitter.ts";
import type { JitsiConnection } from "./sdk-types.ts";

/**
 * How long to wait for a fresh token once Jitsi needs one to resume: the
 * GM relay answers in seconds when a GM is online. Without one the
 * connection is lost and the core reconnects as usual.
 */
export const TOKEN_WAIT_MS = 30_000;

const EXPIRED: ServiceError = {
  code: "token-expired",
  final: false,
  message: "No fresh token came in time",
};

const NETWORK: ServiceError = { code: "network", final: false };

export interface TokenRefresh {
  /** lib-jitsi-meet cancelled a resume: the token ran out. */
  expired(): void;
  update(token: string): Promise<void>;
  cancel(): void;
}

/**
 * lib-jitsi-meet checks the token when its XMPP session resumes; if it
 * ran out, it cancels the resume and waits for `refreshToken`.
 */
export function createTokenRefresh(
  connection: () => JitsiConnection | null,
  emitter: Emitter,
  onEnd: (error: ServiceError) => void,
): TokenRefresh {
  let waiting: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    clearTimeout(waiting);
    waiting = undefined;
  };
  return {
    expired() {
      if (waiting !== undefined) return;
      emitter.emit("state", "resuming");
      waiting = setTimeout(() => {
        waiting = undefined;
        onEnd(EXPIRED);
      }, TOKEN_WAIT_MS);
      emitter.emit("tokenExpiring");
    },
    async update(token) {
      const current = connection();
      if (!current) return;
      const resuming = waiting !== undefined;
      cancel();
      try {
        await current.refreshToken(token);
        if (resuming) emitter.emit("state", "connected");
      } catch {
        // lib-jitsi-meet didn't resume with it (it times out after 3 s).
        onEnd(NETWORK);
      }
    },
    cancel,
  };
}
