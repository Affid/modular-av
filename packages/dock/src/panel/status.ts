import type { AVState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { sessionView, type StatusView } from "../view/session-view.ts";

export interface Status {
  /** `data-status` is the session's kind (part of the UI contract). */
  readonly element: HTMLElement;
  /** Runs with each new view, e.g. for the panel's action button. */
  onChange(listener: (view: StatusView) => void): void;
  /** Moved to another window (Picture-in-Picture): count and watch there. */
  rehome(): void;
  dispose(): void;
}

const TICK_MS = 1000;

/**
 * The session's status as text, in a polite live region. While retrying
 * it counts down once a second, and only while its document is visible: a
 * hidden tab runs no timer for it.
 */
export function createStatus(ctx: DockContext, doc: Document): Status {
  const element = el("span", {
    doc,
    className: "mav-dock-status",
    attrs: { role: "status", "aria-live": "polite" },
  });
  let listeners: readonly ((view: StatusView) => void)[] = [];
  let stopTick: (() => void) | null = null;

  const render = (): void => {
    const view = sessionView(ctx.api.state.get().session, ctx.now());
    element.dataset.status = view.kind;
    const text = ctx.t(view.text.key, view.text.params);
    if (element.textContent !== text) element.textContent = text;
    for (const listener of listeners) listener(view);
  };

  const syncTick = (): void => {
    const owner = element.ownerDocument;
    const wanted =
      ctx.api.state.get().session.status === "retrying" &&
      owner.visibilityState === "visible";
    if (wanted && !stopTick) {
      const view = owner.defaultView ?? window;
      const timer = view.setInterval(render, TICK_MS);
      stopTick = () => {
        view.clearInterval(timer);
      };
    }
    if (!wanted && stopTick) {
      stopTick();
      stopTick = null;
    }
  };

  const onVisibility = (): void => {
    syncTick();
    render();
  };
  let watched = doc;
  watched.addEventListener("visibilitychange", onVisibility);
  const rehome = (): void => {
    const now = element.ownerDocument;
    if (now === watched) return;
    watched.removeEventListener("visibilitychange", onVisibility);
    watched = now;
    watched.addEventListener("visibilitychange", onVisibility);
    // The timer belongs to the window it runs in: start it again there.
    stopTick?.();
    stopTick = null;
    syncTick();
  };
  const off = ctx.api.state.subscribe(
    (s: AVState) => s.session,
    () => {
      render();
      syncTick();
    },
  );
  render();
  syncTick();

  return {
    element,
    onChange(listener) {
      listeners = [...listeners, listener];
      listener(sessionView(ctx.api.state.get().session, ctx.now()));
    },
    rehome,
    dispose() {
      off();
      stopTick?.();
      watched.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
