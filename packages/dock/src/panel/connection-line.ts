import type { ConnectionStats, SessionStatus } from "@modular-av/api";
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

/** Shown while in a call: measured when connected, "Reconnecting" between. */
const SHOWN: ReadonlySet<SessionStatus> = new Set([
  "connected",
  "resuming",
  "retrying",
]);

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

interface LineParts {
  readonly element: HTMLButtonElement;
  readonly bars: HTMLElement;
  readonly lead: HTMLElement;
  readonly ms: HTMLElement;
  readonly where: HTMLElement;
}

function lineParts(ctx: DockContext, doc: Document): LineParts {
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
  return { element, bars, lead, ms, where };
}

/** The visible words: the round trip (or why there is none) and the path. */
function render(
  ctx: DockContext,
  parts: LineParts,
  latest: ConnectionStats | null,
): void {
  const status = ctx.api.state.get().session.status;
  parts.element.hidden = !SHOWN.has(status);
  const quality =
    status === "connected" ? (latest ? qualityOf(latest) : null) : "lost";
  setSignal(parts.bars, quality);
  if (quality) parts.element.dataset.quality = quality;
  else delete parts.element.dataset.quality;
  const rtt = latest?.roundTripMs;
  parts.ms.textContent =
    quality === "lost"
      ? qualityText(ctx, quality)
      : rtt === undefined
        ? ctx.t("connection.measuring")
        : ctx.t("connection.ms", { value: String(rtt) });
  const path =
    latest?.relayed === undefined
      ? ""
      : ctx.t(latest.relayed ? "connection.throughRelay" : "connection.direct");
  parts.where.textContent = [serviceLabel(ctx), path]
    .filter(Boolean)
    .join(" · ");
  parts.lead.textContent =
    quality === "lost" || !quality
      ? ctx.t("connection.lineLeadMeasuring")
      : ctx.t("connection.lineLead", { quality: qualityText(ctx, quality) });
}

interface Measure {
  readonly running: boolean;
  /** Reads now and every two seconds, with that document's timers. */
  start(owner: Document): void;
  /** Stops reading; an answer still on its way is dropped. */
  halt(): void;
}

/** This client's numbers, read on a timer, each answer to `shown`. */
function measure(
  ctx: DockContext,
  shown: (stats: ConnectionStats) => void,
): Measure {
  let stop: (() => void) | null = null;
  let round = 0;
  const read = (): void => {
    const asked = round;
    ctx.api.stats
      .get(null)
      .then((stats) => {
        if (asked === round) shown(stats);
      })
      .catch((error: unknown) => {
        if (!isExpected(error)) ctx.onError(error);
      });
  };
  return {
    get running() {
      return stop !== null;
    },
    start(owner) {
      const view = owner.defaultView ?? window;
      const timer = view.setInterval(read, DETAILS_EVERY_MS);
      stop = () => {
        view.clearInterval(timer);
      };
      read();
    },
    halt() {
      stop?.();
      stop = null;
      round += 1;
    },
  };
}

/**
 * The player's own connection at the top of the voice panel, as in
 * Discord: signal bars, the round trip, the service and the path. It
 * measures every two seconds while connected and on screen, and says
 * "Reconnecting" while the call resumes; a click opens the details.
 */
export function createConnectionLine(
  ctx: DockContext,
  doc: Document,
  open: (anchor: HTMLElement) => void,
): ConnectionLine {
  const parts = lineParts(ctx, doc);
  const { element } = parts;
  element.addEventListener("click", () => {
    open(element);
  });
  let latest: ConnectionStats | null = null;
  let history: readonly number[] = [];
  const reading = measure(ctx, (stats) => {
    latest = stats;
    if (stats.roundTripMs !== undefined)
      history = [...history, stats.roundTripMs].slice(-HISTORY);
    render(ctx, parts, latest);
  });

  const sync = (): void => {
    const owner = element.ownerDocument;
    const connected = ctx.api.state.get().session.status === "connected";
    const wanted = connected && owner.visibilityState === "visible";
    if (wanted && !reading.running) reading.start(owner);
    if (!wanted && reading.running) reading.halt();
    if (!connected) {
      latest = null;
      history = [];
    }
    render(ctx, parts, latest);
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
      reading.halt();
      sync();
    },
    dispose() {
      off();
      reading.halt();
      watched.removeEventListener("visibilitychange", sync);
    },
  };
}
