import type { AudioPlace, ParticipantState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { PLACES } from "../model/pipeline.ts";
import type { EffectEntry } from "../model/snapshot.ts";
import type { Warning } from "../model/warnings.ts";
import type { Report } from "../table/report.ts";
import type { Table } from "../table/table.ts";
import type { MixerContext, Rendered } from "./context.ts";

const PERCENT = 100;

const others = (ctx: MixerContext): readonly ParticipantState[] =>
  Object.values(ctx.api.state.get().participants)
    .filter((p) => !p.isLocal)
    .sort((a, b) => a.name.localeCompare(b.name));

const nameOf = (ctx: MixerContext, id: string): string => {
  const definition = ctx.api.effects.list().find((d) => d.id === id);
  return definition ? ctx.text(definition.label) : id;
};

function effectText(
  ctx: MixerContext,
  id: string,
  entry: EffectEntry,
  place: AudioPlace,
  report: Report,
): string {
  const level =
    place === "send" && entry.mix !== undefined
      ? ` ${String(Math.round(entry.mix * PERCENT))}%`
      : "";
  const failed = report.status[id] === "failed";
  return `${nameOf(ctx, id)}${level}${failed ? ` (${ctx.t("table.failed")})` : ""}`;
}

/** What is on at `place`, in the order it runs. */
function placeText(
  ctx: MixerContext,
  report: Report,
  place: AudioPlace,
): string {
  const { effects, order } = report.snapshot;
  const here = Object.entries(effects).filter(
    ([, entry]) => entry.on === true && entry.place === place,
  );
  const listed = order?.[place] ?? [];
  const rank = (id: string): number => {
    const at = listed.indexOf(id);
    return at < 0 ? listed.length : at;
  };
  return [...here]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([id, entry]) => effectText(ctx, id, entry, place, report))
    .join(", ");
}

const warningText = (ctx: MixerContext, warning: Warning): string =>
  ctx.t(
    `warnings.${warning.key}`,
    warning.effect ? { effect: nameOf(ctx, warning.effect) } : {},
  );

function rowCells(
  ctx: MixerContext,
  doc: Document,
  player: ParticipantState,
  report: Report | undefined,
): readonly HTMLElement[] {
  if (!player.active || !report) {
    const text = ctx.t(player.active ? "table.waiting" : "table.away");
    return [el("td", { doc, text, attrs: { colspan: "4" } })];
  }
  return [
    ...PLACES.map((place) =>
      el("td", {
        doc,
        text: placeText(ctx, report, place),
        attrs: { "data-place": place },
      }),
    ),
    el("td", {
      doc,
      children: report.warnings.map((w) =>
        el("p", {
          doc,
          className: "mav-mixer-hint",
          text: warningText(ctx, w),
        }),
      ),
    }),
  ];
}

function renderTable(
  ctx: MixerContext,
  doc: Document,
  table: Pick<Table, "reportOf">,
): HTMLElement {
  const headings = [
    ctx.t("table.player"),
    ...PLACES.map((place) => ctx.t(`places.${place}`)),
    ctx.t("table.warnings"),
  ];
  return el("table", {
    doc,
    className: "mav-mixer-table",
    children: [
      el("thead", {
        doc,
        children: [
          el("tr", {
            doc,
            children: headings.map((text) =>
              el("th", { doc, text, attrs: { scope: "col" } }),
            ),
          }),
        ],
      }),
      el("tbody", {
        doc,
        children: others(ctx).map((player) =>
          el("tr", {
            doc,
            attrs: { "data-player": player.id },
            children: [
              el("th", { doc, text: player.name, attrs: { scope: "row" } }),
              ...rowCells(ctx, doc, player, table.reportOf(player.id)),
            ],
          }),
        ),
      }),
    ],
  });
}

/** What every player runs, read only, asking them only while it is shown. */
export function renderTableView(
  ctx: MixerContext,
  doc: Document,
  table: Table,
): Rendered {
  const element = el("div", { doc, className: "mav-mixer-view" });
  const render = (): void => {
    element.replaceChildren(renderTable(ctx, doc, table));
  };
  render();
  const stop = table.watch();
  const offReports = table.subscribe(render);
  const offState = ctx.api.state.subscribe((s) => s.participants, render);
  return {
    element,
    dispose() {
      stop();
      offReports();
      offState();
    },
  };
}
