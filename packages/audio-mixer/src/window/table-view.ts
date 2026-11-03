import type {
  AudioPlace,
  EffectDefinition,
  EffectStatus,
  ParticipantState,
} from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Layer } from "../layers/layer.ts";
import { mergeLayers } from "../layers/layer.ts";
import type { LayerStatus } from "../layers/layers.ts";
import { audioEffectsOf, PLACES } from "../model/pipeline.ts";
import { slotOf } from "../model/rack.ts";
import type { Snapshot } from "../model/snapshot.ts";
import type { Warning } from "../model/warnings.ts";
import type { Report } from "../table/report.ts";
import type { Table } from "../table/table.ts";
import { nameOf as cardName } from "./card.ts";
import {
  type ChainData,
  chainData,
  type ChainLocal,
  holds,
} from "./chain-data.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { byField } from "./fields.ts";
import { renderLayerBar } from "./layer-bar.ts";
import { renderLevels } from "./levels.ts";
import { openPop, type Pop } from "./popover.ts";
import { reportSettings } from "./report-settings.ts";
import { renderRouting } from "./routing.ts";
import { keepScrolls } from "./scrolls.ts";

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
  const status = (id: string): EffectStatus =>
    Object.hasOwn(report.status, id) ? (report.status[id] ?? "off") : "off";
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

/**
 * What this GM's own layers hold on a player's chain: only those the player
 * says hold there now, by id, so one since ended or changed marks nothing.
 */
export function gmHeld(
  ctx: MixerContext,
  player: string,
  report: Report,
): { readonly held: Snapshot | null; readonly layers: readonly LayerStatus[] } {
  const holding = report.layers.filter(holds);
  const gm = ctx.gmLayers;
  // Table first: a personal layer overrides it, as on the player's side.
  const mine = [gm?.tableLayer(), gm?.personalLayer(player)].filter(
    (layer): layer is Layer =>
      layer != null && holding.some((h) => h.id === layer.id),
  );
  return {
    held: mergeLayers(mine),
    layers: holding.filter((h) => mine.some((layer) => layer.id === h.id)),
  };
}

/** What a player's report is drawn from, kept to open its settings. */
interface Drawn {
  readonly element: HTMLElement;
  readonly data: ChainData | null;
  readonly report: Report | undefined;
}

type Read = (key: string, anchor: HTMLElement) => void;

function reportView(
  ctx: MixerContext,
  doc: Document,
  player: ParticipantState,
  report: Report,
  read: Read,
): { readonly parts: readonly HTMLElement[]; readonly data: ChainData } {
  const definitions = ctx.api.effects.list();
  const { held, layers: holding } = gmHeld(ctx, player.id, report);
  const data = chainData(
    definitions,
    chainOfReport(definitions, report),
    held,
    holding,
  );
  const unknown = Object.entries(report.snapshot.effects)
    .filter(([id, e]) => e.on === true && !definitions.some((d) => d.id === id))
    .map(([id]) => id);
  const layers = report.layers.map(
    ({ label, state }) => `${label}: ${ctx.t(`table.layer-${state}`)}`,
  );
  // What comes and goes sits after the chain: nothing in it moves.
  const parts = [
    renderRouting(ctx, doc, data, staticGate(ctx, doc), null, read).element,
    renderLevels(ctx, doc, data, null).element,
    report.warnings.length
      ? el("ul", {
          doc,
          className: "mav-mixer-warnings",
          children: report.warnings.map((w) =>
            el("li", { doc, text: warningText(ctx, w) }),
          ),
        })
      : null,
    unknown.length
      ? el("p", {
          doc,
          className: "mav-mixer-hint",
          text: ctx.t("table.unknown", { effects: unknown.join(", ") }),
        })
      : null,
    layers.length
      ? el("p", { doc, className: "mav-mixer-held", text: layers.join(", ") })
      : null,
  ].filter((part): part is HTMLElement => part !== null);
  return { parts, data };
}

function playerView(
  ctx: MixerContext,
  doc: Document,
  player: ParticipantState,
  report: Report | undefined,
  read: Read,
): Drawn {
  const say = (key: string): HTMLElement =>
    el("p", { doc, className: "mav-mixer-hint", text: ctx.t(key) });
  const shown =
    player.active && report ? reportView(ctx, doc, player, report, read) : null;
  const element = el("section", {
    doc,
    className: "mav-mixer-chain",
    attrs: { "data-player": player.id, "aria-label": player.name },
    children: shown
      ? shown.parts
      : [say(player.active ? "table.waiting" : "table.away")],
  });
  return { element, data: shown?.data ?? null, report };
}

/** An open pop-up, to bring back once the player's chain is redrawn. */
interface Kept {
  readonly player: string;
  readonly key: string;
  readonly focused: boolean;
}

/** A player's effect settings, opened over their chain to read. */
function createReader(ctx: MixerContext, doc: Document) {
  let pop: Pop | null = null;
  let on: { readonly drawn: Drawn; readonly player: ParticipantState } | null =
    null;
  const read: Read = (key, anchor) => {
    const data = on?.drawn.data;
    const slot = data ? slotOf(data.racks, key) : undefined;
    if (!on || !data || !slot) return;
    if (pop?.key === key) {
      pop.close(true);
      return;
    }
    pop?.close(false);
    const { drawn, player } = on;
    pop = openPop(ctx, doc, drawn.element, {
      kind: "settings",
      key,
      anchor,
      title: cardName(ctx, slot),
      onClosed: () => {
        pop = null;
      },
      build: () =>
        reportSettings(
          ctx,
          doc,
          data,
          slot,
          drawn.report?.snapshot.effects[slot.effect.id],
          player.name,
        ),
    });
  };
  return {
    read,
    /** Closes what is open, saying what it was. */
    take(): Kept | null {
      if (!pop || !on) return null;
      const kept = {
        player: on.player.id,
        key: pop.key,
        focused: pop.element.contains(doc.activeElement),
      };
      pop.close(false);
      return kept;
    },
    drew(drawn: Drawn | null, player: ParticipantState | undefined): void {
      on = drawn && player ? { drawn, player } : null;
    },
    /** Opens it again on the redrawn chain, the keyboard left where it was. */
    restore(kept: Kept, active: Element | null): void {
      if (on?.player.id !== kept.player) return;
      const anchor = byField(on.drawn.element, `settings.${kept.key}`);
      if (!anchor) return;
      read(kept.key, anchor);
      if (!kept.focused && active instanceof HTMLElement && active.isConnected)
        active.focus();
    },
    close(): void {
      pop?.close(false);
    },
  };
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
    className: "mav-mixer mav-mixer-view",
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
  const reader = createReader(ctx, doc);
  let picked: string | null = null;
  /** Whose chain is drawn now. */
  let drawnFor: string | null = null;
  /** What is drawn: an unasked report from someone else redraws nothing. */
  let drawn = "";
  /** The players offered: an open list isn't rebuilt for a report. */
  let options = "";
  const render = (): void => {
    const players = others(ctx);
    const current = players.find((p) => p.id === picked) ?? players[0];
    const next = JSON.stringify([
      players.map((p) => [p.id, p.name, p.active]),
      current?.id,
      current && table.reportOf(current.id),
    ]);
    if (next === drawn) return;
    drawn = next;
    const listed = JSON.stringify(players.map((p) => [p.id, p.name]));
    if (listed !== options) {
      options = listed;
      picker.replaceChildren(
        ...players.map((p) =>
          el("option", { doc, text: p.name, attrs: { value: p.id } }),
        ),
      );
    }
    const player = players.find((p) => p.id === picked) ?? players[0];
    picked = player?.id ?? null;
    const same = picked !== null && picked === drawnFor;
    drawnFor = picked;
    if (picked) picker.value = picked;
    const active = doc.activeElement;
    const kept = reader.take();
    const scrollBack = keepScrolls(shown);
    const view = player
      ? playerView(ctx, doc, player, table.reportOf(player.id), reader.read)
      : null;
    shown.replaceChildren(
      view?.element ??
        el("p", {
          doc,
          className: "mav-mixer-hint",
          text: ctx.t("table.nobody"),
        }),
    );
    reader.drew(view, player);
    // The same player's report: their chain stays where it was.
    if (!same) return;
    scrollBack();
    if (kept) reader.restore(kept, active);
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
      reader.close();
      stop();
      bar?.dispose();
      offReports();
      offState();
    },
  };
}
