import { MAX_CLAIMS_PER_SENDER } from "./binding-messages.ts";

/**
 * Welcomes a sender's hellos draw at once: enough for a player's tabs
 * joining together.
 */
export const WELCOME_BURST = MAX_CLAIMS_PER_SENDER;

/** Then one more each this long: a modified client can't keep everyone answering. */
export const WELCOME_REFILL_MS = 2000;

interface Allowance {
  readonly left: number;
  readonly at: number;
}

/** What each sender has left, by Foundry user. */
export type Allowances = ReadonlyMap<string, Allowance>;

export interface Drawn {
  readonly allowed: boolean;
  readonly allowances: Allowances;
}

/** Takes one welcome for `sender` at `now`, if they have one left. */
export function drawWelcome(
  allowances: Allowances,
  sender: string,
  now: number,
): Drawn {
  const last = allowances.get(sender);
  const refilled = last
    ? Math.min(
        WELCOME_BURST,
        last.left + Math.max(0, now - last.at) / WELCOME_REFILL_MS,
      )
    : WELCOME_BURST;
  const allowed = refilled >= 1;
  const left = allowed ? refilled - 1 : refilled;
  return {
    allowed,
    allowances: new Map(allowances).set(sender, { left, at: now }),
  };
}
