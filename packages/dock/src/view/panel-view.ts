import type { LocalState } from "@modular-av/api";

/** Warnings the voice panel shows (`data-indicator`, part of the UI contract). */
export type Warning =
  | "open-mic"
  | "speaking-while-muted"
  | "microphone-error"
  | "camera-error"
  | "camera-held"
  | "effect-failed";

export interface ToggleView {
  readonly pressed: boolean;
  readonly disabled: boolean;
}

export interface PanelView {
  /** Pressed: muted. */
  readonly mute: ToggleView;
  /** Pressed: deafened. */
  readonly deafen: ToggleView;
  /** Pressed: the camera is sent. */
  readonly video: ToggleView;
  readonly warnings: readonly Warning[];
}

function warnings(local: LocalState): Warning[] {
  const failed = Object.values(local.effects).some(
    (e) => e.status === "failed",
  );
  return [
    ...(local.openMic ? (["open-mic"] as const) : []),
    ...(local.speakingWhileMuted ? (["speaking-while-muted"] as const) : []),
    ...(local.microphoneError ? (["microphone-error"] as const) : []),
    ...(local.cameraError ? (["camera-error"] as const) : []),
    ...(local.cameraHold && local.cameraHold !== "effect-failed"
      ? (["camera-held"] as const)
      : []),
    ...(failed || local.cameraHold === "effect-failed"
      ? (["effect-failed"] as const)
      : []),
  ];
}

/**
 * The local player's own controls. A GM's block disables unmuting and
 * showing video; the camera shows as off while it is held for an effect.
 */
export function panelView(local: LocalState): PanelView {
  return {
    mute: { pressed: local.muted, disabled: !local.canPublish.audio },
    deafen: { pressed: local.deafened, disabled: false },
    video: {
      pressed: local.videoEnabled && local.hasCamera && !local.cameraHold,
      disabled: !local.canPublish.video,
    },
    warnings: warnings(local),
  };
}
