import type { MediaEnv, OnScreen } from "./env.ts";

interface Watch {
  readonly element: Element;
  readonly listener: (view: OnScreen) => void;
  readonly doc: Document;
  readonly intersecting: boolean;
  /** CSS pixels. */
  readonly height: number;
}

interface Observers {
  readonly intersection: IntersectionObserver;
  readonly resize: ResizeObserver;
  readonly mutation: MutationObserver;
  readonly onVisibility: () => void;
}

/**
 * One intersection and one resize observer per document, as the handoff
 * asks, made with that document's window: an element in the
 * Picture-in-Picture window is seen against that window. An element moved
 * to another document (into or out of that window) is followed there.
 */
export function createOnScreenWatcher(): MediaEnv["watchOnScreen"] {
  let watches: readonly Watch[] = [];
  let observers = new Map<Document, Observers>();

  const tell = (w: Watch): void => {
    const ratio = w.doc.defaultView?.devicePixelRatio ?? 1;
    w.listener({
      visible: w.intersecting && w.doc.visibilityState === "visible",
      height: Math.round(w.height * ratio),
    });
  };

  const update = (
    element: Element,
    change: Partial<Pick<Watch, "intersecting" | "height">>,
  ): void => {
    watches = watches.map((w) =>
      w.element === element ? { ...w, ...change } : w,
    );
    for (const w of watches.filter((x) => x.element === element)) tell(w);
  };

  /** Another window's document, once nothing in it is watched. */
  const release = (doc: Document): void => {
    if (doc === document || watches.some((w) => w.doc === doc)) return;
    const o = observers.get(doc);
    if (!o) return;
    o.intersection.disconnect();
    o.resize.disconnect();
    o.mutation.disconnect();
    doc.removeEventListener("visibilitychange", o.onVisibility);
    const next = new Map(observers);
    next.delete(doc);
    observers = next;
  };

  const follow = (): void => {
    const moved = watches.filter(
      (w) => w.element.isConnected && w.element.ownerDocument !== w.doc,
    );
    for (const w of moved) {
      stop(w);
      const next = { ...w, doc: w.element.ownerDocument };
      watches = watches.map((x) => (x === w ? next : x));
      start(next);
      release(w.doc);
    }
  };

  // Foundry's page changes all the time: one pass per task, if anything is watched.
  let scheduled = false;
  const later = (): void => {
    if (scheduled || watches.length === 0) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      follow();
    });
  };

  const observersOf = (doc: Document): Observers | null => {
    const known = observers.get(doc);
    if (known) return known;
    const view = doc.defaultView;
    if (!view) return null;
    const onVisibility = (): void => {
      for (const w of watches.filter((x) => x.doc === doc)) tell(w);
    };
    const made: Observers = {
      onVisibility,
      mutation: new view.MutationObserver(later),
      intersection: new view.IntersectionObserver((entries) => {
        for (const e of entries)
          update(e.target, {
            intersecting: e.isIntersecting,
            height: e.boundingClientRect.height,
          });
      }),
      resize: new view.ResizeObserver((entries) => {
        for (const e of entries)
          update(e.target, { height: e.contentRect.height });
      }),
    };
    made.mutation.observe(doc, { childList: true, subtree: true });
    doc.addEventListener("visibilitychange", onVisibility);
    observers = new Map(observers).set(doc, made);
    return made;
  };

  function start(w: Watch): void {
    const o = observersOf(w.doc);
    o?.intersection.observe(w.element);
    o?.resize.observe(w.element);
  }

  function stop(w: Watch): void {
    const o = observers.get(w.doc);
    o?.intersection.unobserve(w.element);
    o?.resize.unobserve(w.element);
  }

  return (element, listener) => {
    const watch: Watch = {
      element,
      listener,
      doc: element.ownerDocument,
      intersecting: true,
      height: 0,
    };
    watches = [...watches, watch];
    start(watch);
    return () => {
      const current = watches.find(
        (w) => w.element === element && w.listener === listener,
      );
      if (!current) return;
      stop(current);
      watches = watches.filter((w) => w !== current);
      release(current.doc);
    };
  };
}
