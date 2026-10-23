import type { ServiceError } from "@modular-av/api";
import {
  ConnectionError,
  ConnectionErrorReason,
  DisconnectReason,
} from "livekit-client";

const final = (code: ServiceError["code"], message: string): ServiceError => ({
  code,
  final: true,
  message,
});

const NETWORK: ServiceError = { code: "network", final: false };

/**
 * Why LiveKit ended a connection, as the core sees it. `null` means we
 * left on purpose. Final reasons stop the core's reconnecting; the rest
 * are a lost connection.
 */
export function fromDisconnectReason(
  reason: DisconnectReason | undefined,
): ServiceError | null {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return null;
    case DisconnectReason.DUPLICATE_IDENTITY:
      return final("duplicate", "Joined from another tab or window");
    case DisconnectReason.PARTICIPANT_REMOVED:
      return final("kicked", "Removed from the room");
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return final("room-closed", "The room was closed");
    default:
      return NETWORK;
  }
}

/**
 * Whether a JWT's own `exp` has passed. Servers word the refusal
 * differently (LiveKit Cloud just says "invalid token"), so the client
 * checks the token it presented.
 */
export function isExpired(token: string, now: number): boolean {
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && exp * 1000 <= now;
  } catch {
    // Not a JWT we can read: let the server's answer stand.
    return false;
  }
}

/** The attempt `room.connect()` failed on. */
export interface ConnectAttempt {
  readonly token: string;
  readonly now: number;
}

/** Why `room.connect()` failed. */
export function fromConnectError(
  error: unknown,
  attempt?: ConnectAttempt,
): ServiceError {
  if (!(error instanceof ConnectionError)) return NETWORK;
  switch (error.reason) {
    case ConnectionErrorReason.NotAllowed: {
      // An expired token is worth a retry: the core fetches a fresh one.
      const expired =
        /expired/i.test(error.message) ||
        (attempt !== undefined && isExpired(attempt.token, attempt.now));
      return expired
        ? { code: "token-expired", final: false, message: "Token expired" }
        : final("auth", "LiveKit refused the token");
    }
    case ConnectionErrorReason.ServiceNotFound:
      return final("unsupported", "No LiveKit server at this URL");
    default:
      return NETWORK;
  }
}
