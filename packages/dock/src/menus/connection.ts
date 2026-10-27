import type {
  ConnectionQuality,
  ConnectionStats,
  ParticipantId,
  ParticipantState,
  StatusRowContribution,
} from "@modular-av/api";
import { el, openPopover, type Popover } from "@modular-av/kit";
import { byOrder, follow } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { setSignal, signalBars } from "../ui/signal.ts";
import {
  DETAILS_EVERY_MS,
  isExpected,
  qualityOf,
  qualityText,
} from "../view/connection-view.ts";

type Row = readonly [label: string, value: string];

/** The rows for what a service measured; it may measure nothing. */
export function statsRows(ctx: DockContext, stats: ConnectionStats): Row[] {
  const ms = (value: number): string =>
    ctx.t("connection.ms", { value: String(value) });
  const rows: Row[] = [];
  if (stats.roundTripMs !== undefined)
    rows.push([ctx.t("connection.roundTrip"), ms(stats.roundTripMs)]);
  if (stats.packetLoss !== undefined)
    rows.push([
      ctx.t("connection.packetLoss"),
      ctx.t("connection.percent", {
        value: (stats.packetLoss * 100).toFixed(1),
      }),
    ]);
  if (stats.jitterMs !== undefined)
    rows.push([ctx.t("connection.jitter"), ms(Math.round(stats.jitterMs))]);
  if (stats.relayed !== undefined)
    rows.push([
      ctx.t("connection.path"),
      ctx.t(stats.relayed ? "connection.pathRelay" : "connection.pathDirect"),
    ]);
  return rows;
}

function table(doc: Document, rows: readonly Row[], none: string): HTMLElement {
  if (rows.length === 0) return el("p", { doc, text: none });
  return el("dl", {
    doc,
    className: "mav-dock-details",
    children: rows.flatMap(([label, value]) => [
      el("dt", { doc, text: label }),
      el("dd", { doc, text: value }),
    ]),
  });
}

/** Rows other modules contributed (a server's region, a codec). */
function contributedRows(
  ctx: DockContext,
  doc: Document,
): { element: HTMLElement; dispose(): void } {
  const rows = ctx.api.contributions
    .list()
    .filter((c): c is StatusRowContribution => c.kind === "status-row")
    .sort(byOrder);
  const element = el("dl", { doc, className: "mav-dock-details" });
  const offs = rows.map((row) => {
    const dt = el("dt", { doc, text: ctx.text(row.label) });
    const dd = el("dd", { doc });
    element.append(dt, dd);
    return follow(
      row.value,
      (value) => {
        dt.hidden = value === null;
        dd.hidden = value === null;
        dd.textContent = value === null ? "" : ctx.text(value);
      },
      ctx.onError,
    );
  });
  return {
    element,
    dispose() {
      for (const off of offs) off();
    },
  };
}

/** Round trips over the last minute, as a line, with a 100 ms guide. */
function chart(
  ctx: DockContext,
  doc: Document,
  history: readonly number[],
): Element | null {
  if (history.length < 2) return null;
  const NS = "http://www.w3.org/2000/svg";
  const [w, h] = [300, 56];
  const top = Math.max(200, ...history);
  const y = (v: number): number => h - 4 - (v / top) * (h - 12);
  const x = (i: number): number => (i * w) / (history.length - 1);
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${String(w)} ${String(h)}`);
  svg.setAttribute("class", "mav-dock-connection-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    ctx.t("connection.history", {
      min: String(Math.min(...history)),
      max: String(Math.max(...history)),
    }),
  );
  const guide = doc.createElementNS(NS, "line");
  const guideAt = String(y(100));
  guide.setAttribute("x1", "0");
  guide.setAttribute("x2", String(w));
  guide.setAttribute("y1", guideAt);
  guide.setAttribute("y2", guideAt);
  guide.setAttribute("class", "guide");
  const path = doc.createElementNS(NS, "path");
  path.setAttribute(
    "d",
    history
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" "),
  );
  svg.append(guide, path);
  return svg;
}

/** A sampler reading one participant's stats (or this client's) while shown. */
function sampler(
  ctx: DockContext,
  doc: Document,
  participant: ParticipantId | null,
  shown: (stats: ConnectionStats | null) => void,
): () => void {
  const read = (): void => {
    if (doc.visibilityState !== "visible") return;
    ctx.api.stats
      .get(participant)
      .then(shown)
      .catch((error: unknown) => {
        // Nothing measured yet, or not per player: shown, not an error.
        if (!isExpected(error)) ctx.onError(error);
        shown(null);
      });
  };
  const view = doc.defaultView ?? window;
  const timer = view.setInterval(read, DETAILS_EVERY_MS);
  read();
  return () => {
    view.clearInterval(timer);
  };
}

interface LinkRow {
  readonly id: ParticipantId;
  readonly item: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly more: HTMLElement;
  /** Shows the link's rating as the service updates it. */
  rate(quality: ConnectionQuality | null): void;
}

/** One player's row: bars, name and rating; its numbers fold out below. */
function linkRow(
  ctx: DockContext,
  doc: Document,
  p: ParticipantState,
): LinkRow {
  const bars = signalBars(doc, null);
  const word = el("span", { doc, className: "mav-dock-link-quality" });
  const button = el("button", {
    doc,
    className: "mav-dock-link",
    attrs: { type: "button", "aria-expanded": "false" },
    children: [
      bars,
      el("span", { doc, className: "mav-dock-link-name", text: p.name }),
      word,
    ],
  });
  const more = el("div", {
    doc,
    className: "mav-dock-link-more",
    attrs: { hidden: "" },
  });
  const rate = (quality: ConnectionQuality | null): void => {
    setSignal(bars, quality);
    word.textContent = quality
      ? qualityText(ctx, quality)
      : ctx.t("connection.measuring");
  };
  rate(p.quality);
  const item = el("li", { doc, children: [button, more] });
  return { id: p.id, item, button, more, rate };
}

/** Each other player in the call, a click shows how their link measures. */
function playerLinks(
  ctx: DockContext,
  doc: Document,
  focus: ParticipantId | null,
): { element: HTMLElement; dispose(): void } {
  const others = Object.values(ctx.api.state.get().participants).filter(
    (p: ParticipantState) => !p.isLocal && p.connected,
  );
  const rows = others.map((p) => linkRow(ctx, doc, p));
  let stopOpen: (() => void) | null = null;
  const expand = (open: LinkRow | null): void => {
    stopOpen?.();
    stopOpen = null;
    for (const row of rows) {
      row.button.setAttribute("aria-expanded", String(row === open));
      row.more.hidden = row !== open;
    }
    if (!open) return;
    stopOpen = sampler(ctx, doc, open.id, (stats) => {
      open.more.replaceChildren(
        table(
          doc,
          stats ? statsRows(ctx, stats) : [],
          ctx.t("connection.notPerPlayer"),
        ),
      );
    });
  };
  for (const row of rows)
    row.button.addEventListener("click", () => {
      expand(row.button.getAttribute("aria-expanded") === "true" ? null : row);
    });
  expand(rows.find((row) => row.id === focus) ?? null);
  const off = ctx.api.state.subscribe(
    (s) => s.participants,
    (participants) => {
      for (const row of rows) row.rate(participants[row.id]?.quality ?? null);
    },
  );
  const list = el("ul", {
    doc,
    className: "mav-dock-links",
    children: rows.map((row) => row.item),
  });
  return {
    element: el("div", {
      doc,
      children: [
        el("h3", { doc, text: ctx.t("connection.players") }),
        rows.length ? list : el("p", { doc, text: ctx.t("connection.alone") }),
      ],
    }),
    dispose() {
      off();
      stopOpen?.();
    },
  };
}

/** This client's part: the round trip in large, its last minute, its numbers. */
function ownConnection(
  ctx: DockContext,
  doc: Document,
  history: () => readonly number[],
): { elements: readonly Element[]; dispose(): void } {
  const big = el("p", { doc, className: "mav-dock-connection-big" });
  const graph = el("div", { doc });
  const measured = el("div", { doc });
  const stop = sampler(ctx, doc, null, (stats) => {
    const quality = stats ? qualityOf(stats) : null;
    const rtt = stats?.roundTripMs;
    big.replaceChildren(
      el("strong", {
        doc,
        text:
          rtt === undefined
            ? "–"
            : ctx.t("connection.ms", { value: String(rtt) }),
      }),
      el("span", {
        doc,
        text: quality
          ? qualityText(ctx, quality)
          : ctx.t("connection.measuring"),
      }),
    );
    graph.replaceChildren(
      ...[chart(ctx, doc, history())].filter((c): c is Element => c !== null),
    );
    measured.replaceChildren(
      table(doc, stats ? statsRows(ctx, stats) : [], ctx.t("connection.none")),
    );
  });
  const heading = el("h3", { doc, text: ctx.t("connection.yours") });
  return { elements: [big, graph, heading, measured], dispose: stop };
}

/**
 * The connection details, opened from the voice panel's connection line
 * (or a player's menu, on that player): the round trip and its last
 * minute, this client's numbers, other modules' rows, and every player's
 * link. Read every two seconds while open and visible only.
 */
export function openConnectionDetails(
  ctx: DockContext,
  anchor: HTMLElement,
  focus: ParticipantId | null,
  history: () => readonly number[] = () => [],
): Popover {
  const doc = anchor.ownerDocument;
  const own = ownConnection(ctx, doc, history);
  const extra = contributedRows(ctx, doc);
  const players = playerLinks(ctx, doc, focus);
  const content = el("div", {
    doc,
    className: "mav-dock-connection",
    children: [
      el("h2", { doc, text: ctx.t("connection.title") }),
      ...own.elements,
      extra.element,
      players.element,
    ],
  });
  const popover = openPopover({
    anchor,
    content,
    label: ctx.t("connection.title"),
    onClose() {
      own.dispose();
      players.dispose();
      extra.dispose();
    },
  });
  if (focus)
    content
      .querySelector('.mav-dock-link[aria-expanded="true"]')
      ?.scrollIntoView({ block: "nearest" });
  return popover;
}
