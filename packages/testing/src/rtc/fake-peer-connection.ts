import { createFakeTrack, endFakeTrack } from "../service/fake-track.ts";

/**
 * Enough of `RTCPeerConnection` to test negotiation outside a browser:
 * signalling states with implicit rollback, transceivers with media ids
 * and directions, `negotiationneeded`, trickled candidates and a network
 * the test cuts and restores. Its SDP is JSON, read only by other fakes.
 */
type Direction = RTCRtpTransceiverDirection;

interface Line {
  readonly mid: string;
  readonly kind: "audio" | "video";
  readonly direction: Direction;
}

interface FakeSdp {
  readonly ufrag: string;
  readonly lines: readonly Line[];
}

export interface FakeDescription {
  readonly type: RTCSdpType;
  readonly sdp: string;
}

export interface FakeStats {
  roundTripMs: number;
  packetsLost: number;
  packetsReceived: number;
  jitterMs?: number;
  /** The pair in use goes through a TURN relay. */
  relayed?: boolean;
}

const SENDS: ReadonlySet<Direction> = new Set(["sendrecv", "sendonly"]);
const RECEIVES: ReadonlySet<Direction> = new Set(["sendrecv", "recvonly"]);

/** What `local` agrees to when the other side offers `remote`. */
function answerDirection(local: Direction, remote: Direction): Direction {
  const send = SENDS.has(local) && RECEIVES.has(remote);
  const receive = RECEIVES.has(local) && SENDS.has(remote);
  if (send && receive) return "sendrecv";
  if (send) return "sendonly";
  return receive ? "recvonly" : "inactive";
}

/** The same media line seen from the other side. */
function reverse(direction: Direction): Direction {
  if (direction === "sendonly") return "recvonly";
  if (direction === "recvonly") return "sendonly";
  return direction;
}

const invalidState = (message: string): DOMException =>
  new DOMException(message, "InvalidStateError");

export class FakeSender {
  track: MediaStreamTrack | null = null;
  parameters: RTCRtpSendParameters = {
    transactionId: "t",
    encodings: [],
    codecs: [],
    headerExtensions: [],
    rtcp: {},
  };

  replaceTrack(track: MediaStreamTrack | null): Promise<void> {
    this.track = track;
    return Promise.resolve();
  }

  getParameters(): RTCRtpSendParameters {
    return structuredClone(this.parameters);
  }

  setParameters(parameters: RTCRtpSendParameters): Promise<void> {
    this.parameters = structuredClone(parameters);
    return Promise.resolve();
  }
}

export class FakeTransceiver {
  mid: string | null = null;
  currentDirection: Direction | null = null;
  readonly kind: "audio" | "video";
  readonly sender = new FakeSender();
  readonly receiver: { readonly track: MediaStreamTrack };
  /** The direction last agreed: a change needs negotiating. */
  negotiated: Direction | null = null;
  trackFired = false;
  #direction: Direction;
  readonly #changed: () => void;

  constructor(
    kind: "audio" | "video",
    direction: Direction,
    changed: () => void,
  ) {
    this.kind = kind;
    this.#direction = direction;
    this.#changed = changed;
    this.receiver = { track: createFakeTrack(kind, `remote ${kind}`) };
  }

  /** Agreed: a line that sends gets its encoding, as in browsers. */
  settle(current: Direction): void {
    this.currentDirection = current;
    this.negotiated = this.direction;
    if (SENDS.has(current) && this.sender.parameters.encodings.length === 0)
      this.sender.parameters = {
        ...this.sender.parameters,
        encodings: [{ active: true }],
      };
  }

  get direction(): Direction {
    return this.#direction;
  }

  set direction(direction: Direction) {
    this.#direction = direction;
    this.#changed();
  }
}

let nextUfrag = 1;

export class FakePeerConnection extends EventTarget {
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: FakeDescription | null = null;
  remoteDescription: FakeDescription | null = null;
  configuration: RTCConfiguration;
  readonly candidates: RTCIceCandidateInit[] = [];
  stats: FakeStats = { roundTripMs: 20, packetsLost: 0, packetsReceived: 100 };
  restarts = 0;
  #transceivers: FakeTransceiver[] = [];
  #nextMid = 0;
  #ufrag = `u${String(nextUfrag++)}`;
  #restartPending = false;
  #pendingMids: FakeTransceiver[] = [];
  #networkUp = true;
  #failed = false;
  #negotiationQueued = false;
  #lastRemoteUfrag = "";

  constructor(configuration: RTCConfiguration = {}) {
    super();
    this.configuration = configuration;
  }

  addTransceiver(
    kind: "audio" | "video",
    init: { readonly direction: Direction },
  ): FakeTransceiver {
    const transceiver = new FakeTransceiver(kind, init.direction, () => {
      this.#queueNegotiation();
    });
    this.#transceivers = [...this.#transceivers, transceiver];
    this.#queueNegotiation();
    return transceiver;
  }

  getTransceivers(): FakeTransceiver[] {
    return [...this.#transceivers];
  }

  setLocalDescription(description?: {
    readonly type: "rollback";
  }): Promise<void> {
    if (this.signalingState === "closed")
      return Promise.reject(invalidState("closed"));
    if (description?.type === "rollback") {
      if (this.signalingState === "have-local-offer") this.#rollback();
      this.#queueNegotiation();
      return Promise.resolve();
    }
    if (this.signalingState === "have-remote-offer") this.#answer();
    else this.#offer();
    this.#trickle();
    return Promise.resolve();
  }

  setRemoteDescription(description: FakeDescription): Promise<void> {
    if (this.signalingState === "closed")
      return Promise.reject(invalidState("closed"));
    const sdp = JSON.parse(description.sdp) as FakeSdp;
    if (description.type === "offer") {
      if (this.signalingState === "have-local-offer") this.#rollback();
      if (this.signalingState !== "stable")
        return Promise.reject(invalidState("not ready for an offer"));
      this.#applyOffer(sdp);
      this.remoteDescription = description;
      this.signalingState = "have-remote-offer";
      return Promise.resolve();
    }
    if (this.signalingState !== "have-local-offer")
      return Promise.reject(invalidState("no offer to answer"));
    for (const line of sdp.lines) {
      const t = this.#byMid(line.mid);
      if (!t) continue;
      t.settle(reverse(line.direction));
      this.#fireTrack(t, line.direction);
    }
    this.remoteDescription = description;
    this.#stable(sdp.ufrag);
    return Promise.resolve();
  }

  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescription)
      return Promise.reject(invalidState("no remote description"));
    this.candidates.push(candidate);
    return Promise.resolve();
  }

  restartIce(): void {
    this.restarts += 1;
    this.#restartPending = true;
    this.#queueNegotiation();
  }

  setConfiguration(configuration: RTCConfiguration): void {
    this.configuration = configuration;
  }

  getStats(): Promise<Map<string, Record<string, unknown>>> {
    return Promise.resolve(
      new Map<string, Record<string, unknown>>([
        [
          "pair",
          {
            type: "candidate-pair",
            state: "succeeded",
            nominated: true,
            currentRoundTripTime: this.stats.roundTripMs / 1000,
            localCandidateId: "local",
          },
        ],
        [
          "local",
          {
            type: "local-candidate",
            candidateType: this.stats.relayed ? "relay" : "host",
          },
        ],
        [
          "in",
          {
            type: "inbound-rtp",
            kind: "audio",
            packetsLost: this.stats.packetsLost,
            packetsReceived: this.stats.packetsReceived,
            ...(this.stats.jitterMs === undefined
              ? {}
              : { jitter: this.stats.jitterMs / 1000 }),
          },
        ],
      ]),
    );
  }

  close(): void {
    if (this.signalingState === "closed") return;
    this.signalingState = "closed";
    this.connectionState = "closed";
    for (const t of this.#transceivers) endFakeTrack(t.receiver.track);
  }

  /** The path to the other side breaks: ICE reports it at once. */
  cut(state: "disconnected" | "failed" = "disconnected"): void {
    this.#networkUp = false;
    this.#failed = state === "failed";
    this.#setConnection(state);
  }

  /** A broken path heals; a failed one needs an ICE restart as well. */
  restore(): void {
    this.#networkUp = true;
    if (this.connectionState === "disconnected" && !this.#failed)
      this.#setConnection("connected");
  }

  #byMid(mid: string): FakeTransceiver | undefined {
    return this.#transceivers.find((t) => t.mid === mid);
  }

  #lines(direction: (t: FakeTransceiver) => Direction): Line[] {
    return this.#transceivers.flatMap((t) =>
      t.mid === null
        ? []
        : [{ mid: t.mid, kind: t.kind, direction: direction(t) }],
    );
  }

  /** Media ids are unique across both sides, as in browsers. */
  #freeMid(): string {
    const used = new Set(this.#transceivers.map((t) => t.mid));
    while (used.has(String(this.#nextMid))) this.#nextMid += 1;
    return String(this.#nextMid++);
  }

  #offer(): void {
    this.#pendingMids = this.#transceivers.filter((t) => t.mid === null);
    for (const t of this.#pendingMids) t.mid = this.#freeMid();
    if (this.#restartPending) this.#ufrag = `u${String(nextUfrag++)}`;
    const sdp: FakeSdp = {
      ufrag: this.#ufrag,
      lines: this.#lines((t) => t.direction),
    };
    this.localDescription = { type: "offer", sdp: JSON.stringify(sdp) };
    this.signalingState = "have-local-offer";
  }

  #answer(): void {
    const offer = JSON.parse(this.remoteDescription?.sdp ?? "{}") as FakeSdp;
    const lines = offer.lines.map((line) => {
      const t = this.#byMid(line.mid);
      const direction = t
        ? answerDirection(t.direction, line.direction)
        : "inactive";
      t?.settle(direction);
      return { ...line, direction };
    });
    const sdp: FakeSdp = { ufrag: this.#ufrag, lines };
    this.localDescription = { type: "answer", sdp: JSON.stringify(sdp) };
    this.#stable(offer.ufrag);
  }

  #applyOffer(sdp: FakeSdp): void {
    for (const line of sdp.lines) {
      let t = this.#byMid(line.mid);
      if (!t) {
        t = new FakeTransceiver(line.kind, "recvonly", () => {
          this.#queueNegotiation();
        });
        t.mid = line.mid;
        this.#transceivers = [...this.#transceivers, t];
      }
      this.#fireTrack(t, line.direction);
    }
  }

  #rollback(): void {
    for (const t of this.#pendingMids) t.mid = null;
    this.#pendingMids = [];
    this.localDescription = null;
    this.signalingState = "stable";
  }

  #fireTrack(t: FakeTransceiver, remote: Direction): void {
    if (t.trackFired || !SENDS.has(remote)) return;
    t.trackFired = true;
    const event = Object.assign(new Event("track"), {
      track: t.receiver.track,
      transceiver: t,
      streams: [],
    });
    this.dispatchEvent(event);
  }

  /** Negotiation done: ICE connects, or recovers after a restart. */
  #stable(remoteUfrag: string): void {
    this.signalingState = "stable";
    this.#pendingMids = [];
    const restarted =
      this.#restartPending || remoteUfrag !== this.#lastRemoteUfrag;
    this.#restartPending = false;
    this.#lastRemoteUfrag = remoteUfrag;
    if (this.#networkUp && (this.connectionState !== "failed" || restarted)) {
      this.#failed = false;
      queueMicrotask(() => {
        if (this.#networkUp && this.signalingState !== "closed")
          this.#setConnection("connected");
      });
    }
    this.#queueNegotiation();
  }

  #needsNegotiation(): boolean {
    return (
      this.#restartPending ||
      this.#transceivers.some(
        (t) => t.mid === null || t.negotiated !== t.direction,
      )
    );
  }

  #queueNegotiation(): void {
    if (this.#negotiationQueued) return;
    this.#negotiationQueued = true;
    // A task, as browsers do: a pending answer goes out first.
    setTimeout(() => {
      this.#negotiationQueued = false;
      if (this.signalingState === "stable" && this.#needsNegotiation())
        this.dispatchEvent(new Event("negotiationneeded"));
    }, 0);
  }

  #trickle(): void {
    const candidate = {
      candidate: `candidate:1 1 udp 1 192.0.2.1 5000 typ host ufrag ${this.#ufrag}`,
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    // Gathered after the description is out, as in browsers.
    setTimeout(() => {
      if (this.signalingState === "closed") return;
      this.dispatchEvent(
        Object.assign(new Event("icecandidate"), {
          candidate: { ...candidate, toJSON: () => candidate },
        }),
      );
      this.dispatchEvent(
        Object.assign(new Event("icecandidate"), { candidate: null }),
      );
    }, 0);
  }

  #setConnection(state: RTCPeerConnectionState): void {
    if (this.connectionState === state || this.signalingState === "closed")
      return;
    this.connectionState = state;
    this.dispatchEvent(new Event("connectionstatechange"));
  }
}
