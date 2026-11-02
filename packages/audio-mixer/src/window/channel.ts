import type { LocalState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Lane } from "../model/pipeline.ts";
import type { Writer } from "../model/queue.ts";
import type { MixerContext } from "./context.ts";
import { effectRow, type Row } from "./effect-row.ts";
import { levelSlider } from "./fields.ts";

function fixedPart(
  doc: Document,
  part: string,
  title: string,
  hint: string,
  extra: HTMLElement | null = null,
): HTMLElement {
  return el("section", {
    doc,
    className: "mav-mixer-fixed",
    attrs: { "data-part": part },
    children: [
      el("h3", { doc, text: title }),
      extra,
      el("p", { doc, className: "mav-mixer-hint", text: hint }),
    ],
  });
}

function laneOf(
  ctx: MixerContext,
  doc: Document,
  lane: Lane,
  rows: readonly Row[],
): HTMLElement {
  return el("section", {
    doc,
    className: "mav-mixer-lane",
    attrs: { "data-part": lane.place },
    children: [
      el("h3", { doc, text: ctx.t(`places.${lane.place}`) }),
      el("p", {
        doc,
        className: "mav-mixer-hint",
        text: ctx.t(`placeHints.${lane.place}`),
      }),
      ...(rows.length
        ? rows.map((r) => r.element)
        : [
            el("p", {
              doc,
              className: "mav-mixer-hint",
              text: ctx.t("emptyLane"),
            }),
          ]),
    ],
  });
}

function channelLevel(
  ctx: MixerContext,
  doc: Document,
  writes: Writer,
): { element: HTMLElement; update(local: LocalState): void } {
  const level = levelSlider(doc, ctx.t("channel"), "channel", (value) => {
    void writes.run("channel", () =>
      ctx.api.commands.setAudioChannelLevel(value),
    );
  });
  return {
    element: fixedPart(
      doc,
      "channel",
      ctx.t("channel"),
      ctx.t("channelHint"),
      level.element,
    ),
    update(local) {
      level.show(local.audioChannelLevel);
    },
  };
}

export interface Channel {
  readonly element: HTMLElement;
  update(local: LocalState): void;
  dispose(): void;
}

/** The channel in `docs/voice-routing.md`'s order, top to bottom. */
export function renderChannel(
  ctx: MixerContext,
  doc: Document,
  lanes: readonly Lane[],
  local: LocalState,
  writes: Writer,
): Channel {
  const rowsOf = (lane: Lane): readonly Row[] =>
    lane.effects.map((definition) =>
      effectRow(
        ctx,
        doc,
        { definition, place: lane.place, lanes, writes },
        local,
      ),
    );
  const [pre, post, send] = lanes.map((lane) => [lane, rowsOf(lane)] as const);
  if (!pre || !post || !send) throw new Error("A lane is missing");
  const dry = send[0].effects.length ? channelLevel(ctx, doc, writes) : null;
  const rows = [...pre[1], ...post[1], ...send[1]];
  const update = (next: LocalState): void => {
    dry?.update(next);
    for (const row of rows) row.update(next);
  };
  update(local);
  return {
    update,
    element: el("div", {
      doc,
      className: "mav-mixer-channel",
      children: [
        laneOf(ctx, doc, ...pre),
        fixedPart(doc, "gate", ctx.t("gate"), ctx.t("gateHint")),
        laneOf(ctx, doc, ...post),
        dry?.element,
        laneOf(ctx, doc, ...send),
      ],
    }),
    dispose() {
      for (const row of rows) row.dispose();
    },
  };
}
