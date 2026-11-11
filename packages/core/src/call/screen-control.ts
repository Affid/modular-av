import type { ScreenShareCapability, ScreenShareState } from "@modular-av/api";
import { AVCommandError } from "../errors.ts";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import type { MediaEnv } from "../media/env.ts";
import { mayShareScreen, readScreenShareRule } from "../media/screen-rule.ts";
import type { ScreenShare } from "../media/screen-share.ts";
import type { Runtime } from "./runtime.ts";

/** The rules around the local player's screen share. */
export interface ScreenControl {
  /** The shared screen and its sound, while sharing. */
  readonly video: MediaStreamTrack | null;
  readonly audio: MediaStreamTrack | null;
  /** Checks, then opens the picker. */
  start(audio: boolean): Promise<void>;
  stop(): void;
  /**
   * Stops a share the call, the service or the rules no longer allow, and
   * loads the sharing code once a share is possible.
   */
  enforce(): void;
  state(): ScreenShareState;
}

type RefusalCode = "not-ready" | "unsupported" | "forbidden";

const REFUSALS: Readonly<Record<RefusalCode, string>> = {
  "not-ready": "Join the call to share a screen",
  unsupported: "This service can't share a screen",
  forbidden: "You may not share a screen",
};

export interface ScreenControlDeps {
  readonly game: FoundryGame;
  readonly facts: AVFacts;
  readonly rt: Runtime;
  readonly env: Pick<MediaEnv, "captureDisplay">;
  /** The share started, stopped or lost its sound. */
  readonly onChange: () => void;
  readonly onError: (error: unknown) => void;
}

/**
 * The share itself loads lazily, as soon as a share is possible: a click
 * then finds it ready, and the picker opens within the click's user
 * activation.
 */
function createLazyShare(deps: ScreenControlDeps): () => Promise<ScreenShare> {
  let loading: Promise<ScreenShare> | null = null;
  return () => {
    loading ??= import("../media/screen-share.ts").then(
      ({ createScreenShare }) => {
        const share = createScreenShare(deps.env);
        share.onChange(deps.onChange);
        return share;
      },
      (error: unknown) => {
        // A failed load (a network drop) is tried again on the next click.
        loading = null;
        throw error;
      },
    );
    return loading;
  };
}

export function createScreenControl(deps: ScreenControlDeps): ScreenControl {
  const { game, facts, rt } = deps;
  const load = createLazyShare(deps);
  let share: ScreenShare | null = null;
  /** Loaded ahead once; a click loads again if that failed. */
  let preloaded = false;
  /** Counts starts and stops: a start waiting for the code checks it. */
  let wanted = 0;
  const capability = (): ScreenShareCapability | null =>
    rt.capabilities?.screenShare ?? null;
  const allowed = (): boolean => mayShareScreen(game, facts, facts.selfId);
  const audioAvailable = (): boolean =>
    (capability()?.audio ?? false) && facts.canBroadcast(facts.selfId).audio;

  /** Why a share can't start now; null when it can. */
  const refusal = (): RefusalCode | null => {
    if (rt.session.status !== "connected") return "not-ready";
    if (!capability()) return "unsupported";
    if (!allowed()) return "forbidden";
    return null;
  };

  const loaded = async (): Promise<ScreenShare> => {
    share = await load();
    return share;
  };

  return {
    get video() {
      return share?.video ?? null;
    },
    get audio() {
      return share?.audio ?? null;
    },
    async start(audio) {
      wanted += 1;
      const mine = wanted;
      const refuse = (): void => {
        const refused = refusal();
        if (refused) throw new AVCommandError(refused, REFUSALS[refused]);
      };
      refuse();
      const ready = share ?? (await loaded());
      // Stopped, or no longer allowed, while the code loaded.
      if (mine !== wanted) return;
      refuse();
      await ready.start(audio && audioAvailable());
    },
    stop() {
      wanted += 1;
      share?.stop();
    },
    enforce() {
      if (!share && !preloaded && refusal() === null) {
        preloaded = true;
        loaded().catch(deps.onError);
      }
      if (!share?.video) return;
      const { status } = rt.session;
      const ended = status === "left" || status === "idle";
      // Unknown while reconnecting: the share waits for the call to return.
      const unsupported = rt.capabilities !== null && !capability();
      if (ended || unsupported || !allowed()) share.stop();
    },
    state: () => ({
      active: (share?.video ?? null) !== null,
      audio: (share?.audio ?? null) !== null,
      available: refusal() === null,
      audioAvailable: audioAvailable(),
      rule: readScreenShareRule(game),
    }),
  };
}
