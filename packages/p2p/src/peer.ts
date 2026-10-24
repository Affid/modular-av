/**
 * The part of `RTCPeerConnection` this module uses, so tests can run the
 * same code on `@modular-av/testing`'s fake.
 */
export interface SenderLike {
  readonly track: MediaStreamTrack | null;
  replaceTrack(track: MediaStreamTrack | null): Promise<void>;
  getParameters(): RTCRtpSendParameters;
  setParameters(parameters: RTCRtpSendParameters): Promise<void>;
}

export interface TransceiverLike {
  readonly mid: string | null;
  direction: RTCRtpTransceiverDirection;
  readonly currentDirection: RTCRtpTransceiverDirection | null;
  readonly sender: SenderLike;
  readonly receiver: { readonly track: MediaStreamTrack };
}

export interface DescriptionLike {
  readonly type: RTCSdpType;
  readonly sdp: string;
}

export interface PeerConnectionLike extends EventTarget {
  readonly signalingState: RTCSignalingState;
  readonly connectionState: RTCPeerConnectionState;
  readonly localDescription: DescriptionLike | null;
  addTransceiver(
    kind: "audio" | "video",
    init: { readonly direction: RTCRtpTransceiverDirection },
  ): TransceiverLike;
  getTransceivers(): TransceiverLike[];
  setLocalDescription(): Promise<void>;
  setRemoteDescription(description: DescriptionLike): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  restartIce(): void;
  setConfiguration(configuration: RTCConfiguration): void;
  getStats(): Promise<ReadonlyMap<string, unknown>>;
  close(): void;
}

export type CreatePeerConnection = (
  configuration: RTCConfiguration,
) => PeerConnectionLike;
