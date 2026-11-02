import type {
  AudioPlace,
  EffectDefinition,
  EffectStatus,
  ParticipantState,
} from "@modular-av/api";
import { el } from "@modular-av/kit";
import { audioEffectsOf, PLACES } from "../model/pipeline.ts";
import type { Warning } from "../model/warnings.ts";
import type { Report } from "../table/report.ts";
import type { Table } from "../table/table.ts";
import { chainData, type ChainLocal } from "./chain-data.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { renderLayerBar } from "./layer-bar.ts";
import { renderLevels } from "./levels.ts";
import { renderRouting } from "./routing.ts";

const others = (ctx: MixerContext): readonly ParticipantState[] =>
  Object.values(ctx.api.state.get().participants)
    .filter((p) => !p.isLocal)
    .sort((a, b) => a.name.localeCompare(b.name));

const nameOf = (ctx: MixerContext, id: string): string => {
  const definition = ctx.api.effects.list().find((d) => d.id === id);
  return definition ? ctx.text(definition.label) : id;
};

/** A report read as this client's own state, for the same panels. */
export function chainOfReport(
  definitions: readonly EffectDefinition[],
  report: Report,
): ChainLocal {
  const { effects, order, channelLevel } = report.snapshot;
  const audio = audioEffectsOf(definitions);
  const known = Object.entries(effects).filter(([id]) =>
    audio.some((d) => d.id === id),
  );
  const status = (id: string): EffectStatus => report.status[id] ?? "off";
  return {
    chosenEffects: known.filter(([, e]) => e.on === true).map(([id]) => id),
    effects: Object.fromEntries(
      known.map(([id]) => [id, { status: status(id), error: null }]),
    ),
    audioEffectPlaces: Object.fromEntries(
      audio.map((d) => [d.id, effects[d.id]?.place ?? d.defaultPlace]),
    ),
    audioEffectOrder: Object.fromEntries(
      PLACES.map((place) => [place, order?.[place] ?? []]),
    ) as Record<AudioPlace, readonly string[]>,
    audioEffectMix: Object.fromEntries(
      known.flatMap(([id, e]) =>
        e.mix === undefined ? [] : [[id, e.mix] as const],
      ),
    ),
    audioChannelLevel: channelLevel ?? 1,
    audioCutTails: false,
  };
}

const warningText = (ctx: MixerContext, warning: Warning): string =>
  ctx.t(
    `warnings.${warning.key}`,
    warning.effect ? { effect: nameOf(ctx, warning.effect) } : {},
  );

/** The gate on another player's chain: no meter, it is theirs. */
const staticGate = (ctx: MixerContext, doc: Document): HTMLElement =>
  el("section", {
    doc,
    className: "mav-mixer-gate",
    attrs: { "data-part": "gate", title: ctx.t("gateHint") },
    children: [el("h3", { doc, text: ctx.t("gateShort") })],
  });

function reportView(
  ctx: MixerContext,
  doc: Document,
  report: Report,
): readonly HTMLElement[] {
  const definitions = ctx.api.effects.list();
  const data = chainData(definitions, chainOfReport(definitions, report));
  const unknown = Object.entries(report.snapshot.effects)
    .filter(([id, e]) => e.on === true && !definitions.some((d) => d.id === id))
    .map(([id]) => id);
  const layers = report.layers.map(
    ({ label, state }) => `${label}: ${ctx.t(`table.layer-${state}`)}`,
  );
  return [
    layers.length
      ? el("p", { doc, className: "mav-mixer-held", text: layers.join(", ") })
      : null,
    report.warnings.length
      ? el("ul", {
          doc,
          className: "mav-mixer-warnings",
          children: report.warnings.map((w) =>
            el("li", { doc, text: warningText(ctx, w) }),
          ),
        })
      : null,
    renderRouting(ctx, doc, data, staticGate(ctx, doc), null).element,
    renderLevels(ctx, doc, data, null).element,
    unknown.length
      ? el("p", {
          doc,
          className: "mav-mixer-hint",
          text: ctx.t("table.unknown", { effects: unknown.join(", ") }),
        })
      : null,
  ].filter((part): part is HTMLElement => part !== null);
}

function playerView(
  ctx: MixerContext,
  doc: Document,
  player: ParticipantState,
  report: Report | undefined,
): HTMLElement {
  const say = (key: string): HTMLElement =>
    el("p", { doc, className: "mav-mixer-hint", text: ctx.t(key) });
  const children = !player.active
    ? [say("table.away")]
    : report
      ? reportView(ctx, doc, report)
      : [say("table.waiting")];
  return el("section", {
    doc,
    className: "mav-mixer-chain",
    attrs: { "data-player": player.id, "aria-label": player.name },
    children,
  });
}

/** One player's chain at a time, read only, asking only while it is shown. */
export function renderTableView(
  ctx: MixerContext,
  doc: Document,
  table: Table,
): Rendered {
  const picker = el("select", {
    doc,
    attrs: { "data-field": "player", "aria-label": ctx.t("table.player") },
  });
  const shown = el("div", { doc });
  const bar = ctx.gmLayers ? renderLayerBar(ctx, doc, ctx.gmLayers) : null;
  const element = el("div", {
    doc,
    className: "mav-mixer-view",
    children: [
      bar?.element,
      el("div", {
        doc,
        className: "mav-mixer-choice",
        children: [el("span", { doc, text: ctx.t("table.player") }), picker],
      }),
      shown,
    ],
  });
  let picked: string | null = null;
  const render = (): void => {
    const players = others(ctx);
    picker.replaceChildren(
      ...players.map((p) =>
        el("option", { doc, text: p.name, attrs: { value: p.id } }),
      ),
    );
    const player = players.find((p) => p.id === picked) ?? players[0];
    picked = player?.id ?? null;
    if (picked) picker.value = picked;
    shown.replaceChildren(
      player
        ? playerView(ctx, doc, player, table.reportOf(player.id))
        : el("p", {
            doc,
            className: "mav-mixer-hint",
            text: ctx.t("table.nobody"),
          }),
    );
  };
  picker.addEventListener("change", () => {
    picked = picker.value;
    render();
  });
  render();
  const stop = table.watch();
  const offReports = table.subscribe(render);
  const offState = ctx.api.state.subscribe((s) => s.participants, render);
  return {
    element,
    dispose() {
      stop();
      bar?.dispose();
      offReports();
      offState();
    },
  };
}
