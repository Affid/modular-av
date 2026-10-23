import type { ServiceError, TokenRequest } from "@modular-av/api";

const PREFIX = "mock.";

export interface MockTokenClaims {
  readonly participant: string;
  readonly room: string;
  readonly canPublish: { readonly audio: boolean; readonly video: boolean };
  readonly expiresAt: number;
}

/** Not a secure token: the mock service only checks shape and claims. */
export function signMockToken(request: TokenRequest, now: number): string {
  const claims: MockTokenClaims = {
    participant: request.participant,
    room: request.room,
    canPublish: request.canPublish,
    expiresAt: now + request.ttlSeconds * 1000,
  };
  return PREFIX + btoa(encodeURIComponent(JSON.stringify(claims)));
}

function decode(token: string): MockTokenClaims | undefined {
  if (!token.startsWith(PREFIX)) return undefined;
  try {
    const value: unknown = JSON.parse(
      decodeURIComponent(atob(token.slice(PREFIX.length))),
    );
    return isClaims(value) ? value : undefined;
  } catch {
    // Any decoding failure means the token is not one of ours.
    return undefined;
  }
}

function isClaims(value: unknown): value is MockTokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.participant === "string" &&
    typeof v.room === "string" &&
    typeof v.expiresAt === "number" &&
    typeof v.canPublish === "object" &&
    v.canPublish !== null
  );
}

export function verifyMockToken(
  token: string,
  expected: { readonly participant: string; readonly room: string },
  now: number,
): MockTokenClaims | ServiceError {
  const claims = decode(token);
  if (
    claims?.participant !== expected.participant ||
    claims.room !== expected.room
  ) {
    return { code: "auth", final: true, message: "Invalid token" };
  }
  if (claims.expiresAt <= now) {
    return { code: "token-expired", final: false, message: "Token expired" };
  }
  return claims;
}
