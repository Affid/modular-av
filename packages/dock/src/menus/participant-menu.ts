import type {
  ParticipantActionContribution,
  ParticipantId,
  ParticipantState,
} from "@modular-av/api";
import {
  createMeter,
  el,
  openPopover,
  type Popover,
  uniqueId,
} from "@modular-av/kit";
import { byOrder, follow, type Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import { setSignal, signalBars } from "../ui/signal.ts";
import { isExpected, qualityOf, qualityText } from "../view/connection-view.ts";

/** A switch the menu shows for one participant, kept in step with the state. */
function stateSwitch(
  ctx: DockContext,
  doc: Document,
  options: {
    readonly label: string;
    readonly name: string;
    readonly checked: () => boolean;
    readonly toggle: (checked: boolean) => Promise<void>;
  },
  alerts: HTMLElement,
): Rendered {
  const button = el("button", {
    doc,
    className: "mav-control-switch",
    text: options.label,
    attrs: { type: "button", role: "switch", "data-action": options.name },
  });
  const render = (): void => {
    button.setAttribute("aria-checked", String(options.checked()));
  };
  button.addEventListener("click", () => {
    run(ctx, alerts, () => options.toggle(!options.checked()));
  });
  render();
  const off = ctx.api.state.subscribe((s) => s.participants, render);
  return { element: button, dispose: off };
}

function volume(
  ctx: DockContext,
  doc: Document,
  id: ParticipantId,
  alerts: HTMLElement,
): Rendered {
  const inputId = uniqueId(doc, "mav-volume");
  const percent = (): number =>
    Math.round((ctx.api.state.get().participants[id]?.volume ?? 1) * 100);
  const input = el("input", {
    doc,
    attrs: { id: inputId, type: "range", min: "0", max: "100", step: "1" },
  });
  const describe = (): void => {
    input.setAttribute(
      "aria-valuetext",
      ctx.t("menu.volumeValue", { percent: input.value }),
    );
  };
  const follow = (): void => {
    // Not while the player drags it: their hand wins.
    if (input.ownerDocument.activeElement === input) return;
    input.value = String(percent());
    describe();
  };
  follow();
  input.addEventListener("input", describe);
  // Once released: each step of a drag would write Foundry's settings.
  input.addEventListener("change", () => {
    run(ctx, alerts, () =>
      ctx.api.commands.setVolume(id, Number(input.value) / 100),
    );
  });
  const offVolume = ctx.api.state.subscribe(
    (s) => s.participants[id]?.volume,
    follow,
  );
  const meter = createMeter(doc, { label: ctx.t("menu.level") });
  const unmeter = ctx.api.meters.subscribe(id, meter.element, (reading) => {
    meter.set(reading);
  });
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "range" },
    children: [
      el("label", { doc, text: ctx.t("menu.volume"), attrs: { for: inputId } }),
      input,
      meter.element,
    ],
  });
  return {
    element,
    dispose() {
      unmeter();
      offVolume();
    },
  };
}

/** Hiding them here, and a GM's blocks. */
function ownActions(
  ctx: DockContext,
  doc: Document,
  id: ParticipantId,
  alerts: HTMLElement,
): readonly Rendered[] {
  const p = (): ParticipantState | undefined =>
    ctx.api.state.get().participants[id];
  const { commands } = ctx.api;
  const hide = stateSwitch(
    ctx,
    doc,
    {
      label: ctx.t("menu.hide"),
      name: "hide",
      checked: () => p()?.hiddenByMe ?? false,
      toggle: (on) => commands.setHiddenByMe(id, on),
    },
    alerts,
  );
  if (!ctx.isGM) return [hide];
  const block = (kind: "audio" | "video", label: string): Rendered =>
    stateSwitch(
      ctx,
      doc,
      {
        label,
        name: `block-${kind}`,
        checked: () =>
          (kind === "audio" ? p()?.blockedAudio : p()?.blockedVideo) === true,
        toggle: (on) => commands.setBroadcastPermissions(id, { [kind]: !on }),
      },
      alerts,
    );
  return [
    hide,
    block("audio", ctx.t("menu.blockAudio")),
    block("video", ctx.t("menu.blockVideo")),
  ];
}

/** A plugin's own test; one that throws is reported and left out. */
function applies(
  ctx: DockContext,
  c: ParticipantActionContribution,
  participant: ParticipantState,
): boolean {
  try {
    return c.appliesTo?.(participant) ?? true;
  } catch (error: unknown) {
    ctx.onError(error);
    return false;
  }
}

/** Other modules' actions that apply to this participant. */
function contributedActions(
  ctx: DockContext,
  doc: Document,
  participant: ParticipantState,
  alerts: HTMLElement,
): readonly Rendered[] {
  return ctx.api.contributions
    .list()
    .filter(
      (c): c is ParticipantActionContribution =>
        c.kind === "participant-action" &&
        (!c.gmOnly || ctx.isGM) &&
        applies(ctx, c, participant),
    )
    .sort(byOrder)
    .map((c) => {
      const button = el("button", {
        doc,
        className: "mav-control-button",
        text: ctx.text(c.label),
        attrs: { type: "button", "data-contribution": c.id },
      });
      button.addEventListener("click", () => {
        run(ctx, alerts, () => c.run(participant.id));
      });
      const off = c.checked
        ? follow(
            c.checked,
            (ids) => {
              button.setAttribute("role", "switch");
              button.setAttribute(
                "aria-checked",
                String(ids.has(participant.id)),
              );
            },
            ctx.onError,
          )
        : () => undefined;
      return { element: button, dispose: off };
    });
}

/**
 * One line for the link to a participant (or this client's connection):
 * its quality and round trip, read once as the menu opens, and "Details".
 */
function linkLine(
  ctx: DockContext,
  doc: Document,
  p: ParticipantState,
  details: () => void,
): HTMLElement {
  const bars = signalBars(doc, p.isLocal ? null : p.quality);
  const text = el("span", { doc, text: ctx.t("connection.linkLineMeasuring") });
  const open = el("button", {
    doc,
    className: "mav-control-button",
    text: ctx.t("connection.details"),
    attrs: {
      type: "button",
      "aria-haspopup": "dialog",
      "data-action": "connection",
      "aria-label": ctx.t("connection.detailsFor", { name: p.name }),
    },
  });
  open.addEventListener("click", details);
  ctx.api.stats
    .get(p.isLocal ? null : p.id)
    .then((stats) => {
      const quality = (p.isLocal ? null : p.quality) ?? qualityOf(stats);
      setSignal(bars, quality);
      if (quality && stats.roundTripMs !== undefined)
        text.textContent = ctx.t("connection.linkLine", {
          quality: qualityText(ctx, quality),
          ms: ctx.t("connection.ms", { value: String(stats.roundTripMs) }),
        });
    })
    .catch((error: unknown) => {
      if (!isExpected(error)) ctx.onError(error);
    });
  return el("div", {
    doc,
    className: "mav-dock-link-line",
    children: [bars, text, open],
  });
}

/** A participant's menu, by their tile. The local player has fewer items. */
export function openParticipantMenu(
  ctx: DockContext,
  participant: ParticipantId,
  anchor: HTMLElement,
  showDetails: (participant: ParticipantId | null) => void = (focus) => {
    // The details' code loads on first use.
    import("./connection.ts")
      .then(({ openConnectionDetails }) => {
        openConnectionDetails(ctx, anchor, focus);
      })
      .catch(ctx.onError);
  },
): Popover | null {
  const p = ctx.api.state.get().participants[participant];
  if (!p) return null;
  const doc = anchor.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  // The details open from the voice panel, the menu closing as they do.
  const details = linkLine(ctx, doc, p, () => {
    showDetails(p.isLocal ? null : participant);
  });
  const parts = p.isLocal
    ? contributedActions(ctx, doc, p, alerts)
    : [
        volume(ctx, doc, participant, alerts),
        ...ownActions(ctx, doc, participant, alerts),
        ...contributedActions(ctx, doc, p, alerts),
      ];
  const content = el("div", {
    doc,
    className: "mav-dock-menu",
    children: [
      el("h2", { doc, text: p.name }),
      ...parts.map((part) => part.element),
      details,
      alerts,
    ],
  });
  return openPopover({
    anchor,
    content,
    label: ctx.t("tile.options", { name: p.name }),
    onClose() {
      for (const part of parts) part.dispose();
    },
  });
}
