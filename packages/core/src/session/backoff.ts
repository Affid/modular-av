import type { ServiceErrorCode, SessionEndReason } from "@modular-av/api";

/** Discord-like: 1, 3, 5, 10, 20 s, then every 30 s, forever. */
export const BACKOFF_MS: readonly number[] = [
  1_000, 3_000, 5_000, 10_000, 20_000, 30_000,
];

/** The wait before retry number `attempt` (1 for the first retry). */
export function backoffDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[index] ?? 30_000;
}

/** Why a final service error ends the session; null when it is retried. */
export function endReasonFor(code: ServiceErrorCode): SessionEndReason | null {
  switch (code) {
    case "duplicate":
      return "joined-elsewhere";
    case "kicked":
      return "kicked";
    case "room-closed":
      return "room-closed";
    case "auth":
      return "auth";
    case "full":
      return "full";
    case "unsupported":
      return "unsupported";
    case "network":
    case "token-expired":
      return null;
  }
}
