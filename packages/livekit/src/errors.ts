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

/** Why `room.connect()` failed. */
export function fromConnectError(error: unknown): ServiceError {
  if (!(error instanceof ConnectionError)) return NETWORK;
  switch (error.reason) {
    case ConnectionErrorReason.NotAllowed:
      // An expired token is worth a retry: the core fetches a fresh one.
      return /expired/i.test(error.message)
        ? { code: "token-expired", final: false, message: "Token expired" }
        : final("auth", "LiveKit refused the token");
    case ConnectionErrorReason.ServiceNotFound:
      return final("unsupported", "No LiveKit server at this URL");
    default:
      return NETWORK;
  }
}
