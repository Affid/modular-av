import type { SubscriptionOptions } from "@modular-av/api";
import type { OnScreen } from "./env.ts";

/**
 * How long a video stays wanted once nothing shows it: a scroll or a
 * moment behind a window doesn't pause it, and a P2P mesh doesn't
 * renegotiate at every glance.
 */
export const OFF_SCREEN_GRACE_MS = 3000;

/** The quality a rendered height in device pixels needs, per simulcast layer. */
export function qualityFor(height: number): SubscriptionOptions["maxQuality"] {
  if (height <= 0) return undefined;
  if (height <= 240) return "low";
  if (height <= 480) return "medium";
  return "high";
}

export interface Wanted {
  readonly shown: boolean;
  /** The tallest element showing it, in device pixels; 0 if unknown. */
  readonly height: number;
}

/**
 * Whether each video (by key) is shown anywhere, from its elements' views.
 * A new element counts as shown until its observer says otherwise. Going
 * from shown to not shown waits `OFF_SCREEN_GRACE_MS`; coming back is at
 * once. `onChange` runs when what is wanted changed.
 */
export interface OnScreenTracker {
  /** A video is there to show (a track arrived). */
  track(key: string): void;
  untrack(key: string): void;
  /** An element shows `key`; the returned function forgets it. */
  add(key: string, element: object): () => void;
  /** What the element's observer said. */
  view(element: object, view: OnScreen): void;
  wanted(key: string): Wanted;
}

interface Shown {
  readonly key: string;
  readonly view: OnScreen;
}

const NEW_ELEMENT: OnScreen = { visible: true, height: 0 };

export function createOnScreen(onChange: () => void): OnScreenTracker {
  let elements = new Map<object, Shown>();
  let shown = new Map<string, Wanted>();
  let timers = new Map<string, ReturnType<typeof setTimeout>>();

  const seen = (key: string): Wanted => {
    const views = [...elements.values()]
      .filter((e) => e.key === key && e.view.visible)
      .map((e) => e.view.height);
    return { shown: views.length > 0, height: Math.max(0, ...views) };
  };

  const set = (key: string, next: Wanted): void => {
    const before = shown.get(key);
    shown = new Map(shown).set(key, next);
    if (before?.shown !== next.shown || before.height !== next.height)
      onChange();
  };

  const stopTimer = (key: string): void => {
    clearTimeout(timers.get(key));
    const next = new Map(timers);
    next.delete(key);
    timers = next;
  };

  /** Leaving the screen waits; the height it had is kept meanwhile. */
  const update = (key: string): void => {
    if (!shown.has(key)) return;
    const now = seen(key);
    if (now.shown) {
      stopTimer(key);
      set(key, now);
      return;
    }
    if (timers.has(key) || shown.get(key)?.shown === false) return;
    const timer = setTimeout(() => {
      stopTimer(key);
      if (!seen(key).shown) set(key, { shown: false, height: 0 });
    }, OFF_SCREEN_GRACE_MS);
    timers = new Map(timers).set(key, timer);
  };

  return {
    track(key) {
      if (shown.has(key)) return;
      shown = new Map(shown).set(key, { shown: true, height: 0 });
      update(key);
    },
    untrack(key) {
      stopTimer(key);
      const next = new Map(shown);
      next.delete(key);
      shown = next;
    },
    add(key, element) {
      elements = new Map(elements).set(element, { key, view: NEW_ELEMENT });
      update(key);
      return () => {
        const next = new Map(elements);
        next.delete(element);
        elements = next;
        update(key);
      };
    },
    view(element, view) {
      const entry = elements.get(element);
      if (!entry) return;
      elements = new Map(elements).set(element, { ...entry, view });
      update(entry.key);
    },
    wanted: (key) => shown.get(key) ?? { shown: true, height: 0 },
  };
}
