import type { ConnectionStats } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { setSignal, signalBars } from "../ui/signal.ts";
import {
  DETAILS_EVERY_MS,
  isExpected,
  qualityOf,
  qualityText,
} from "../view/connection-view.ts";

/** Round trips kept for the details' chart: a minute at one every 2 s. */
const HISTORY = 30;

export interface ConnectionLine {
  readonly element: HTMLButtonElement;
  /** The last round trips measured, oldest first. */
  history(): readonly number[];
  /** Moved to another window (Picture-in-Picture): measure there. */
  rehome(): void;
  dispose(): void;
}

/** The service carrying the call, by its label. */
export function serviceLabel(ctx: DockContext): string {
  const id = ctx.api.state.get().service.id;
  const label = id ? ctx.api.services.get(id)?.label : undefined;
  return label ? ctx.text(label) : "";
}

/**
 * The player's own connection at the top of the voice panel, as in
 * Discord: signal bars, the round trip, the service and the path. It
 * measures every two seconds while in the call and on screen; a click
 * opens the connection details.
 */
export function createConnectionLine(
  ctx: DockContext,
  doc: Document,
  open: (anchor: HTMLElement) => void,
): ConnectionLine {
  const bars = signalBars(doc, null);
  // Words for screen readers around the visible ones: the name keeps
  // what is seen (WCAG 2.5.3), so speech users can say it.
  const lead = el("span", { doc, className: "mav-sr-only" });
  const tail = el("span", {
    doc,
    className: "mav-sr-only",
    text: `. ${ctx.t("connection.title")}`,
  });
  const ms = el("span", { doc, className: "mav-dock-connection-ms" });
  const where = el("span", { doc, className: "mav-dock-connection-where" });
  const element = el("button", {
    doc,
    className: "mav-dock-connection-status",
    attrs: { type: "button", "aria-haspopup": "dialog" },
    children: [bars, lead, ms, where, tail],
  });
  element.addEventListener("click", () => {
    open(element);
  });
  let latest: ConnectionStats | null = null;
  let history: readonly number[] = [];
  let stop: (() => void) | null = null;
  const inCall = (): boolean =>
    ctx.api.state.get().session.status === "connected";

  const render = (): void => {
    element.hidden = !inCall();
    const quality = latest ? qualityOf(latest) : null;
    setSignal(bars, quality);
    if (quality) element.dataset.quality = quality;
    else delete element.dataset.quality;
    const rtt = latest?.roundTripMs;
    ms.textContent =
      rtt === undefined
        ? ctx.t("connection.measuring")
        : ctx.t("connection.ms", { value: String(rtt) });
    const path =
      latest?.relayed === undefined
        ? ""
        : ctx.t(
            latest.relayed ? "connection.throughRelay" : "connection.direct",
          );
    where.textContent = [serviceLabel(ctx), path].filter(Boolean).join(" · ");
    lead.textContent = quality
      ? ctx.t("connection.lineLead", { quality: qualityText(ctx, quality) })
      : ctx.t("connection.lineLeadMeasuring");
  };

  const read = (): void => {
    ctx.api.stats
      .get(null)
      .then((stats) => {
        latest = stats;
        if (stats.roundTripMs !== undefined)
          history = [...history, stats.roundTripMs].slice(-HISTORY);
        render();
      })
      .catch((error: unknown) => {
        if (!isExpected(error)) ctx.onError(error);
      });
  };

  const sync = (): void => {
    const owner = element.ownerDocument;
    const wanted = inCall() && owner.visibilityState === "visible";
    if (wanted && !stop) {
      const view = owner.defaultView ?? window;
      const timer = view.setInterval(read, DETAILS_EVERY_MS);
      stop = () => {
        view.clearInterval(timer);
      };
      read();
    }
    if (!wanted && stop) {
      stop();
      stop = null;
    }
    if (!inCall()) {
      latest = null;
      history = [];
    }
    render();
  };

  let watched = doc;
  watched.addEventListener("visibilitychange", sync);
  const off = ctx.api.state.subscribe((s) => s.session, sync);
  sync();

  return {
    element,
    history: () => history,
    rehome() {
      if (element.ownerDocument === watched) return;
      watched.removeEventListener("visibilitychange", sync);
      watched = element.ownerDocument;
      watched.addEventListener("visibilitychange", sync);
      stop?.();
      stop = null;
      sync();
    },
    dispose() {
      off();
      stop?.();
      watched.removeEventListener("visibilitychange", sync);
    },
  };
}
