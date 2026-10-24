import type { CandidateInit, SessionDescription } from "./messages.ts";
import type { PeerConnectionLike } from "./peer.ts";

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
  };
  let queue: Promise<void> = Promise.resolve();

  pc.addEventListener("negotiationneeded", () => {
    flags.makingOffer = true;
    pc.setLocalDescription()
      .then(() => {
        sendLocal(deps);
      })
      .catch(deps.onError)
      .finally(() => {
        flags.makingOffer = false;
      });
  });

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
