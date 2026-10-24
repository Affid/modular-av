import type {
  ConnectionStats,
  ParticipantId,
  StatusRowContribution,
} from "@modular-av/api";
import { el, openPopover, type Popover } from "@modular-av/kit";
import { byOrder, follow } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";

/** How often the details are read while shown; the core caches for a second. */
export const DETAILS_EVERY_MS = 2000;

type Row = readonly [label: string, value: string];

const EXPECTED: ReadonlySet<unknown> = new Set([
  "not-ready",
  "unsupported",
  "unknown-participant",
]);

/** A command error the details expect, rather than a bug. */
const isExpected = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  EXPECTED.has((error as { code?: unknown }).code);

/** The rows for what a service measured; it may measure nothing. */
export function statsRows(ctx: DockContext, stats: ConnectionStats): Row[] {
  const ms = (value: number): string =>
    ctx.t("connection.ms", { value: String(value) });
  return [
    ...(stats.roundTripMs === undefined
      ? []
      : [[ctx.t("connection.roundTrip"), ms(stats.roundTripMs)] as const]),
    ...(stats.packetLoss === undefined
      ? []
      : [
          [
            ctx.t("connection.packetLoss"),
            ctx.t("connection.percent", {
              value: (stats.packetLoss * 100).toFixed(1),
            }),
          ] as const,
        ]),
    ...(stats.jitterMs === undefined
      ? []
      : [[ctx.t("connection.jitter"), ms(stats.jitterMs)] as const]),
    ...(stats.relayed === undefined
      ? []
      : [
          [
            ctx.t("connection.relayed"),
            ctx.t(stats.relayed ? "connection.yes" : "connection.no"),
          ] as const,
        ]),
  ];
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

/**
 * The connection details for a participant (the local player: their own
 * connection), read every two seconds while open and visible only.
 */
export function openConnectionDetails(
  ctx: DockContext,
  anchor: HTMLElement,
  participant: ParticipantId,
): Popover {
  const doc = anchor.ownerDocument;
  const isSelf = participant === ctx.selfId;
  const measured = el("div", { doc });
  const extra = contributedRows(ctx, doc);
  const read = (): void => {
    if (doc.visibilityState !== "visible") return;
    ctx.api.stats
      .get(isSelf ? null : participant)
      .then((stats) => {
        measured.replaceChildren(
          table(doc, statsRows(ctx, stats), ctx.t("connection.none")),
        );
      })
      .catch((error: unknown) => {
        // Nothing measured yet, or not per player: shown, not an error.
        if (!isExpected(error)) ctx.onError(error);
        measured.replaceChildren(
          el("p", { doc, text: ctx.t("connection.none") }),
        );
      });
  };
  const view = doc.defaultView ?? window;
  const timer = view.setInterval(read, DETAILS_EVERY_MS);
  read();
  const content = el("div", {
    doc,
    className: "mav-dock-connection",
    children: [
      el("h2", { doc, text: ctx.t("connection.title") }),
      el("h3", {
        doc,
        text: ctx.t(isSelf ? "connection.yours" : "connection.theirs"),
      }),
      measured,
      ...(isSelf ? [extra.element] : []),
    ],
  });
  return openPopover({
    anchor,
    content,
    label: ctx.t("connection.title"),
    onClose() {
      view.clearInterval(timer);
      extra.dispose();
    },
  });
}
