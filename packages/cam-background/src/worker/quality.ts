import type { Quality } from "../settings.ts";
import type { Session } from "./session.ts";
import type { Segmenters } from "./segmenters.ts";

export interface QualitySwitch {
  /** Swaps to this quality once the ones asked before are done. */
  request(quality: Quality): void;
}

/**
 * Quality swaps, one at a time: the latest one asked for wins, ones asked
 * for meanwhile are skipped. The old segmenter runs until the new one can
 * take over; one that can't start leaves the old running.
 */
export function createQualitySwitch(
  session: Session,
  segmenters: Segmenters,
  initial: Quality,
  deps: {
    readonly usable: (quality: Quality) => Quality;
    readonly isOver: () => boolean;
    readonly onError: (error: unknown) => void;
  },
): QualitySwitch {
  let current = initial;
  let wanted: Quality | null = null;
  let busy = false;

  const swap = async (quality: Quality): Promise<void> => {
    const next = await segmenters.create(
      session.files,
      session.models[quality],
      session.canvas,
    );
    // Turned off, or asked for another meanwhile: this one isn't needed.
    if (deps.isOver() || wanted !== null) {
      next.close();
      return;
    }
    session.pipeline.setSegmenter(next);
    current = quality;
  };

  const drain = async (): Promise<void> => {
    busy = true;
    while (wanted !== null && !deps.isOver()) {
      const quality = deps.usable(wanted);
      wanted = null;
      if (quality === current) continue;
      await swap(quality).catch(deps.onError);
    }
    busy = false;
  };

  return {
    request(quality) {
      wanted = quality;
      if (!busy) void drain();
    },
  };
}
