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
}

/**
 * The W3C "perfect negotiation" pattern: either side may offer whenever
 * the browser asks; when both offer at once, the impolite side ignores the
 * other's offer and the polite side rolls its own back. Received messages
 * are handled one at a time, in order.
 */
export function createNegotiation(deps: NegotiationDeps): Negotiation {
  const { pc } = deps;
  let makingOffer = false;
  let ignoreOffer = false;
  let applyingAnswer = false;
  let queue: Promise<void> = Promise.resolve();

  const sendLocal = (): void => {
    const local = pc.localDescription;
    if (local?.type !== "offer" && local?.type !== "answer") return;
    deps.send({ description: { type: local.type, sdp: local.sdp } });
    deps.onDescriptionSent?.();
  };

  pc.addEventListener("negotiationneeded", () => {
    makingOffer = true;
    pc.setLocalDescription()
      .then(sendLocal)
      .catch(deps.onError)
      .finally(() => {
        makingOffer = false;
      });
  });

  const applyDescription = async (
    description: SessionDescription,
  ): Promise<void> => {
    const ready =
      !makingOffer && (pc.signalingState === "stable" || applyingAnswer);
    const collision = description.type === "offer" && !ready;
    ignoreOffer = !deps.polite && collision;
    if (ignoreOffer) return;
    applyingAnswer = description.type === "answer";
    try {
      await pc.setRemoteDescription(description);
    } finally {
      applyingAnswer = false;
    }
    deps.onDescriptionApplied?.();
    if (description.type !== "offer") return;
    await pc.setLocalDescription();
    sendLocal();
  };

  const applyCandidate = async (
    candidate: CandidateInit | null,
  ): Promise<void> => {
    // The end of candidates needs no action: ICE ends by itself.
    if (!candidate) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch (error: unknown) {
      // Candidates of an offer this side ignored are expected to fail.
      if (!ignoreOffer) throw error;
    }
  };

  const enqueue = (run: () => Promise<void>): Promise<void> => {
    const next = queue.then(run).catch(deps.onError);
    queue = next;
    return next;
  };

  return {
    receiveDescription: (description) =>
      enqueue(() => applyDescription(description)),
    receiveCandidate: (candidate) => enqueue(() => applyCandidate(candidate)),
  };
}
