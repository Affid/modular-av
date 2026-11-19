/**
 * Claims on the core's socket (channel "jitsi"), open servers only: "this
 * Jitsi endpoint is me". Foundry's server names the sending user;
 * everything else is the sender's word, checked here before anything
 * reads it.
 */
export const PROTOCOL = 1;

/** A user's claims kept at once: a few tabs. Older ones are dropped. */
export const MAX_CLAIMS_PER_SENDER = 8;

/** Sent to everyone once joined, or in answer to a hello (to its sender). */
export interface Claim {
  readonly v: typeof PROTOCOL;
  readonly type: "hello" | "welcome";
  /** The Jitsi room, so a claim for another (an old address) is dropped. */
  readonly room: string;
  /** The sender's endpoint in that room (its MUC nick). */
  readonly endpoint: string;
  /** When the sender's page first joined, by its clock: the later tab wins. */
  readonly joinedAt: number;
}

const ENDPOINT = /^[\w-]{1,64}$/;
const TYPES: ReadonlySet<unknown> = new Set(["hello", "welcome"]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** A claim for `room`, or null for anything else. */
export function readClaim(data: unknown, room: string): Claim | null {
  if (!isRecord(data)) return null;
  const { v, type, endpoint, joinedAt } = data;
  if (v !== PROTOCOL || data.room !== room || !TYPES.has(type)) return null;
  if (typeof endpoint !== "string" || !ENDPOINT.test(endpoint)) return null;
  if (typeof joinedAt !== "number" || !Number.isFinite(joinedAt)) return null;
  return {
    v: PROTOCOL,
    type: type === "hello" ? "hello" : "welcome",
    room,
    endpoint,
    joinedAt,
  };
}
