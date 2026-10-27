import type { ServiceError } from "@modular-av/api";

/** Thrown from `connect()` with the reason the core needs. */
export class JitsiServiceError extends Error {
  readonly serviceError: ServiceError;

  constructor(serviceError: ServiceError, options?: { cause?: unknown }) {
    super(serviceError.message ?? serviceError.code, options);
    this.name = "JitsiServiceError";
    this.serviceError = serviceError;
  }
}

const final = (code: ServiceError["code"], message: string): ServiceError => ({
  code,
  final: true,
  message,
});

export const NETWORK: ServiceError = { code: "network", final: false };

const EXPIRED: ServiceError = {
  code: "token-expired",
  final: false,
  message: "Token expired",
};

/**
 * Whether a JWT's own `exp` has passed. Prosody refuses an expired token
 * as it refuses a forged one, so the client checks the token it presented.
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

/** The token a refusal is about, to tell expired from forged. */
export interface Attempt {
  readonly token: string;
  readonly now: number;
}

const refused = (attempt: Attempt): ServiceError =>
  isExpired(attempt.token, attempt.now)
    ? EXPIRED
    : final("auth", "The Jitsi server refused the token");

/** `JitsiConnectionErrors`: why the XMPP connection failed. */
export function fromConnectionError(
  error: string,
  attempt: Attempt,
): ServiceError {
  return error === "connection.passwordRequired" ? refused(attempt) : NETWORK;
}

const CONFERENCE_FINAL: Readonly<Record<string, ServiceError>> = {
  "conference.max_users": final("full", "The Jitsi room is full"),
  "conference.destroyed": final("room-closed", "The room was closed"),
  "conference.incompatible_server_versions": final(
    "unsupported",
    "This Jitsi server's version doesn't work with this module",
  ),
};

const CONFERENCE_REFUSED: ReadonlySet<string> = new Set([
  "conference.authenticationRequired",
  "conference.connectionError.notAllowed",
  "conference.connectionError.accessDenied",
  "conference.connectionError.membersOnly",
  "conference.passwordRequired",
]);

/** `JitsiConferenceErrors`: why joining or staying in the room failed. */
export function fromConferenceError(
  error: string,
  attempt: Attempt,
): ServiceError {
  if (CONFERENCE_REFUSED.has(error)) return refused(attempt);
  return CONFERENCE_FINAL[error] ?? NETWORK;
}
