import type { AVState } from "@modular-av/api";

/** The state before Foundry's `setup`, when no user is known yet. */
export const INITIAL_STATE: AVState = {
  session: { status: "idle", attempt: 0, nextRetryAt: null, reason: null },
  participants: {},
  local: {
    muted: false,
    videoEnabled: true,
    deafened: false,
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
  },
  service: { id: null, capabilities: null },
};
