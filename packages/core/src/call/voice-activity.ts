import type { AVFacts } from "../foundry/av-facts.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import type { LocalMedia } from "../media/local-media.ts";
import type { Runtime } from "./runtime.ts";

export interface VoiceActivityDeps {
  readonly game: FoundryGame;
  readonly facts: AVFacts;
  readonly rt: Runtime;
  readonly local: LocalMedia;
  /** Recomputes what is sent and shown. */
  readonly apply: () => void;
}

export interface VoiceActivity {
  /** Foundry's `toggleBroadcast`: push to talk, or Foundry's own calls. */
  onIntent(intent: boolean): void;
  /** After anything that decides whether the gate drives (mode, gate). */
  sync(): void;
}

/**
 * In "always" and voice activity modes the core's gate is the one detector:
 * Foundry gets no levels stream, so it never decides by itself. What the
 * gate hears goes through `AVMaster.broadcast`, which keeps Foundry's
 * speaking flag, the activity it tells the others and the dock in step.
 * Foundry's own calls (its start, push to mute) are set back to what the
 * gate hears. In push to talk mode Foundry's key decides, as in Foundry.
 */
export function createVoiceActivity(deps: VoiceActivityDeps): VoiceActivity {
  const { game, facts, rt, local } = deps;
  /** Inside our own `broadcast`: its `toggleBroadcast` is the echo. */
  let echoing = false;
  /** What the gate last told Foundry; null while the gate doesn't drive. */
  let reported: boolean | null = null;

  const gateDrives = (): boolean =>
    rt.foundryConnected && facts.voiceMode() !== "ptt" && local.gateRunning;

  const report = (open: boolean): void => {
    const webrtc = game.webrtc;
    if (!webrtc) return;
    reported = open;
    echoing = true;
    try {
      webrtc.broadcast(open);
    } finally {
      echoing = false;
    }
  };

  const sync = (): void => {
    if (gateDrives()) {
      if (reported !== rt.gateOpen) report(rt.gateOpen);
      return;
    }
    // Hand back to Foundry's key without leaving "speaking" behind.
    const handBack = reported === true;
    reported = null;
    if (handBack) report(false);
    reported = null;
  };

  // `apply()` syncs.
  local.onGate((open) => {
    rt.gateOpen = open;
    deps.apply();
  });

  return {
    onIntent(intent) {
      // Our own report is not the player's push to talk.
      if (echoing) return;
      rt.intent = intent;
      if (gateDrives() && intent !== rt.gateOpen)
        // After Foundry's own broadcast() has finished.
        queueMicrotask(() => {
          reported = null;
          sync();
        });
      deps.apply();
    },
    sync,
  };
}
