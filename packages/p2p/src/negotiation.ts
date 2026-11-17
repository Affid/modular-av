import type { CandidateInit, SessionDescription } from "./messages.ts";
import type { PeerConnectionLike } from "./peer.ts";

/**
 * How long the side that gives way waits, on a new link, for the other
 * side's first offer before making its own. Both offering at once is a
 * collision: the polite side rolls its offer back, and Chrome then
 * sometimes gathers no candidates at all, leaving the link silent until
 * it is replaced.
 */
export const POLITE_WAIT_MS = 1_000;

export type NegotiationMessage =
  | { readonly description: SessionDescription }
  | { readonly candidate: CandidateInit | null };

export interface NegotiationDeps {
  readonly pc: PeerConnectionLike;
  /** The polite side gives way when both offer at once. */
  readonly polite: boolean;
  readonly send: (message: NegotiationMessage) => void;
  /** A local description went out: offer or answer. */
  readonly onDescriptionSent?: () => void;
  /** A remote description was applied. */
  readonly onDescriptionApplied?: () => void;
  readonly onError: (error: unknown) => void;
}

export interface Negotiation {
  receiveDescription(description: SessionDescription): Promise<void>;
  receiveCandidate(candidate: CandidateInit | null): Promise<void>;
  /**
   * Withdraws an offer still waiting for its answer (one may have been
   * lost); the browser then asks for a new one.
   */
  unstick(): Promise<void>;
}

/** Where this side's negotiation stands, shared by its steps. */
interface Flags {
  makingOffer: boolean;
  ignoreOffer: boolean;
  applyingAnswer: boolean;
  /** A description from the other side was applied once. */
  heard: boolean;
}

/** Sends the offer or answer just set, if there is one. */
function sendLocal(deps: NegotiationDeps): void {
  const local = deps.pc.localDescription;
  if (local?.type !== "offer" && local?.type !== "answer") return;
  deps.send({ description: { type: local.type, sdp: local.sdp } });
  deps.onDescriptionSent?.();
}

/** An offer or answer from the other side; a colliding offer per politeness. */
async function applyDescription(
  deps: NegotiationDeps,
  flags: Flags,
  description: SessionDescription,
): Promise<void> {
  const { pc } = deps;
  const ready =
    !flags.makingOffer &&
    (pc.signalingState === "stable" || flags.applyingAnswer);
  const collision = description.type === "offer" && !ready;
  flags.ignoreOffer = !deps.polite && collision;
  if (flags.ignoreOffer) return;
  flags.applyingAnswer = description.type === "answer";
  try {
    await pc.setRemoteDescription(description);
  } finally {
    flags.applyingAnswer = false;
  }
  flags.heard = true;
  deps.onDescriptionApplied?.();
  if (description.type !== "offer") return;
  await pc.setLocalDescription();
  sendLocal(deps);
}

async function applyCandidate(
  deps: NegotiationDeps,
  flags: Flags,
  candidate: CandidateInit | null,
): Promise<void> {
  // The end of candidates needs no action: ICE ends by itself.
  if (!candidate) return;
  try {
    await deps.pc.addIceCandidate(candidate);
  } catch (error: unknown) {
    // Candidates of an offer this side ignored are expected to fail.
    if (!flags.ignoreOffer) throw error;
  }
}

/**
 * What answers the browser's `negotiationneeded`: an offer, except on the
 * polite side of a new link, which first gives the other side's offer
 * time to arrive (the browser asks again once it is answered).
 */
function offering(deps: NegotiationDeps, flags: Flags): () => void {
  const { pc } = deps;
  const offer = (): void => {
    flags.makingOffer = true;
    pc.setLocalDescription()
      .then(() => {
        sendLocal(deps);
      })
      .catch(deps.onError)
      .finally(() => {
        flags.makingOffer = false;
      });
  };
  let waiting = false;
  return () => {
    if (!deps.polite || flags.heard) {
      offer();
      return;
    }
    if (waiting) return;
    waiting = true;
    setTimeout(() => {
      waiting = false;
      if (!flags.heard && pc.signalingState === "stable") offer();
    }, POLITE_WAIT_MS);
  };
}

/**
 * The W3C "perfect negotiation" pattern: either side may offer whenever
 * the browser asks; when both offer at once, the impolite side ignores the
 * other's offer and the polite side rolls its own back. Received messages
 * are handled one at a time, in order.
 */
export function createNegotiation(deps: NegotiationDeps): Negotiation {
  const { pc } = deps;
  const flags: Flags = {
    makingOffer: false,
    ignoreOffer: false,
    applyingAnswer: false,
    heard: false,
  };
  let queue: Promise<void> = Promise.resolve();

  pc.addEventListener("negotiationneeded", offering(deps, flags));

  const enqueue = (run: () => Promise<void>): Promise<void> => {
    const next = queue.then(run).catch(deps.onError);
    queue = next;
    return next;
  };

  return {
    receiveDescription: (description) =>
      enqueue(() => applyDescription(deps, flags, description)),
    receiveCandidate: (candidate) =>
      enqueue(() => applyCandidate(deps, flags, candidate)),
    unstick: () =>
      enqueue(async () => {
        if (pc.signalingState === "have-local-offer")
          await pc.setLocalDescription({ type: "rollback" });
      }),
  };
}
