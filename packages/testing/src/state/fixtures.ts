/**
 * Plain AVState values for UI tests: a connected call where everyone may
 * speak and show video, changed by what a test gives.
 */
import type {
  AVState,
  LocalState,
  ParticipantId,
  ParticipantState,
  SessionState,
} from "@modular-av/api";

const BOTH = { audio: true, video: true } as const;

export function participantState(
  changes: Partial<ParticipantState> & { readonly id: ParticipantId },
): ParticipantState {
  return {
    name: changes.id,
    color: null,
    avatar: null,
    isGM: false,
    isLocal: false,
    active: true,
    connected: true,
    hasAudio: true,
    hasVideo: true,
    speaking: false,
    muted: false,
    hidden: false,
    deafened: false,
    canBroadcast: BOTH,
    blockedAudio: false,
    blockedVideo: false,
    volume: 1,
    hiddenByMe: false,
    quality: null,
    ...changes,
  };
}

export function localState(changes: Partial<LocalState> = {}): LocalState {
  return {
    muted: false,
    videoEnabled: true,
    deafened: false,
    receiveVideo: true,
    broadcasting: false,
    voiceMode: "activity",
    canPublish: BOTH,
    hasMicrophone: true,
    hasCamera: true,
    microphoneError: null,
    cameraError: null,
    openMic: false,
    speakingWhileMuted: false,
    effects: {},
    inputSensitivity: { auto: true, threshold: -50 },
    cameraHold: null,
    chosenDevices: {
      audioInput: "default",
      videoInput: "default",
      audioOutput: "default",
    },
    ...changes,
  };
}

export function sessionState(
  changes: Partial<SessionState> = {},
): SessionState {
  return {
    status: "connected",
    attempt: 0,
    nextRetryAt: null,
    reason: null,
    ...changes,
  };
}

/** A call with the local player `me` and whoever else is given. */
export function avState(
  changes: {
    readonly participants?: readonly ParticipantState[];
    readonly local?: Partial<LocalState>;
    readonly session?: Partial<SessionState>;
  } & Partial<Omit<AVState, "participants" | "local" | "session">> = {},
): AVState {
  const me = participantState({ id: "me", isLocal: true });
  const participants = changes.participants ?? [me];
  return {
    session: sessionState(changes.session),
    worldMode: changes.worldMode ?? BOTH,
    participants: Object.fromEntries(participants.map((p) => [p.id, p])),
    local: localState(changes.local),
    devices: changes.devices ?? {
      audioInput: [],
      videoInput: [],
      audioOutput: [],
    },
    service: changes.service ?? {
      id: "mock",
      capabilities: {
        speakingDetection: true,
      },
    },
  };
}
