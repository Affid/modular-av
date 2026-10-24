import type { AVState } from "@modular-av/api";

/** The state before Foundry's `setup`, when no user is known yet. */
export const INITIAL_STATE: AVState = {
  session: { status: "idle", attempt: 0, nextRetryAt: null, reason: null },
  worldMode: { audio: false, video: false },
  participants: {},
  local: {
    muted: false,
    videoEnabled: true,
    deafened: false,
    receiveVideo: true,
    broadcasting: false,
    voiceMode: "ptt",
    canPublish: { audio: false, video: false },
    hasMicrophone: false,
    hasCamera: false,
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
  },
  devices: { audioInput: [], videoInput: [], audioOutput: [] },
  service: { id: null, capabilities: null },
};
