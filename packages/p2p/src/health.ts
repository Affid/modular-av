import type { LinkState } from "./link.ts";

export interface HealthDeps {
  readonly lostAfterMs: number;
  readonly onResuming: () => void;
  readonly onRecovered: () => void;
  readonly onLost: () => void;
}

export interface Health {
  update(links: readonly LinkState[]): void;
  stop(): void;
}

/**
 * The call as a whole: resuming while links are down and none is up (most
 * likely this player's own network), lost if that lasts. Alone in the
 * call, or with one link up, it is connected.
 */
export function createHealth(deps: HealthDeps): Health {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resuming = false;
  let stopped = false;

  return {
    update(links) {
      if (stopped) return;
      const allDown = links.includes("down") && !links.includes("connected");
      if (allDown && !resuming) {
        resuming = true;
        deps.onResuming();
        timer = setTimeout(() => {
          stopped = true;
          deps.onLost();
        }, deps.lostAfterMs);
      } else if (!allDown && resuming) {
        resuming = false;
        clearTimeout(timer);
        deps.onRecovered();
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
