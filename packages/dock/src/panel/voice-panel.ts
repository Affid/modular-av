import type { AVState } from "@modular-av/api";
import { el, roving } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { type IconButton, iconButton } from "../ui/button.ts";
import { syncIndicators } from "../ui/indicators.ts";
import {
  type ConnectionLine,
  createConnectionLine,
} from "./connection-line.ts";
import { run } from "../ui/run.ts";
import { panelView } from "../view/panel-view.ts";
import type { StatusView } from "../view/session-view.ts";
import type { Status } from "./status.ts";

export interface VoicePanel {
  readonly element: HTMLElement;
  /** The player's own connection, at the top of the panel. */
  readonly connection: ConnectionLine;
  dispose(): void;
}

export interface PanelHandlers {
  /** Opens the quick controls (effects, contributions) by `anchor`. */
  quick(anchor: HTMLElement): void;
  /** Opens the connection details by `anchor`. */
  connection(anchor: HTMLElement): void;
}

type Go = (command: () => Promise<unknown>) => void;

interface Toggles {
  readonly mute: IconButton;
  readonly deafen: IconButton;
  readonly video: IconButton;
}

/** Mute, deafen and camera; each runs a core command against the state. */
function toggles(ctx: DockContext, doc: Document, go: Go): Toggles {
  const { commands } = ctx.api;
  const local = (): AVState["local"] => ctx.api.state.get().local;
  const toggle = (className: string, onClick: () => Promise<void>) =>
    iconButton(doc, {
      className,
      label: "",
      icon: "fa-circle",
      toggle: true,
      onClick: () => {
        go(onClick);
      },
    });
  return {
    mute: toggle("mav-dock-mute", () => commands.setMuted(!local().muted)),
    deafen: toggle("mav-dock-deafen", () =>
      commands.setDeafened(!local().deafened),
    ),
    video: toggle("mav-dock-video", () =>
      commands.setVideoEnabled(!local().videoEnabled),
    ),
  };
}

/** Shows the local state on the toggles and the warnings. */
function renderLocal(
  ctx: DockContext,
  t: Toggles,
  warnings: HTMLElement,
): void {
  const view = panelView(ctx.api.state.get().local);
  t.mute.set({
    ...view.mute,
    label: ctx.t(view.mute.pressed ? "panel.unmute" : "panel.mute"),
    icon: view.mute.pressed ? "fa-microphone-slash" : "fa-microphone",
  });
  t.deafen.set({
    ...view.deafen,
    label: ctx.t(view.deafen.pressed ? "panel.undeafen" : "panel.deafen"),
    icon: view.deafen.pressed ? "fa-ear-deaf" : "fa-headphones",
  });
  t.video.set({
    ...view.video,
    label: ctx.t(view.video.pressed ? "panel.cameraOff" : "panel.cameraOn"),
    icon: view.video.pressed ? "fa-video" : "fa-video-slash",
  });
  syncIndicators(ctx, warnings, view.warnings);
}

/** Reconnect now, rejoin or leave, as the status allows. */
function sessionButtons(
  ctx: DockContext,
  doc: Document,
  go: Go,
  status: Status,
): readonly IconButton[] {
  let action: StatusView["action"] = null;
  const act = iconButton(doc, {
    className: "mav-dock-action",
    label: ctx.t("panel.reconnect"),
    icon: "fa-rotate-right",
    onClick: () => {
      if (action === "reconnect") go(() => ctx.api.commands.reconnectNow());
      if (action === "rejoin") go(() => ctx.api.commands.rejoin());
    },
  });
  const leave = iconButton(doc, {
    className: "mav-dock-leave",
    label: ctx.t("panel.leave"),
    icon: "fa-phone-slash",
    onClick: () => {
      go(() => ctx.api.commands.leave());
    },
  });
  status.onChange((view) => {
    action = view.action;
    act.element.hidden = view.action === null;
    const rejoin = view.action === "rejoin";
    act.set({
      label: ctx.t(rejoin ? "panel.rejoin" : "panel.reconnect"),
      icon: rejoin ? "fa-phone" : "fa-rotate-right",
    });
    leave.element.hidden = view.kind === "ended" || view.kind === "idle";
  });
  return [act, leave];
}

/** The quick controls' popover and the settings window. */
function windowButtons(
  ctx: DockContext,
  doc: Document,
  handlers: PanelHandlers,
): readonly IconButton[] {
  const quick = iconButton(doc, {
    className: "mav-dock-quick",
    label: ctx.t("panel.quick"),
    icon: "fa-sliders",
    onClick: (button) => {
      handlers.quick(button);
    },
  });
  quick.element.setAttribute("aria-haspopup", "dialog");
  const settings = iconButton(doc, {
    className: "mav-dock-settings",
    label: ctx.t("panel.settings"),
    icon: "fa-gear",
    onClick: () => {
      ctx.openSettings();
    },
  });
  return [quick, settings];
}

/**
 * The voice panel: the player's warnings, mute, deafen, camera, quick
 * controls, the settings window, and reconnecting, rejoining or leaving.
 * Everything shows the core's state; nothing assumes it.
 */
export function createVoicePanel(
  ctx: DockContext,
  doc: Document,
  status: Status,
  handlers: PanelHandlers,
): VoicePanel {
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const warnings = el("div", {
    doc,
    className: "mav-dock-warnings",
    attrs: { role: "group", "aria-label": ctx.t("panel.label") },
  });
  const go: Go = (command) => {
    run(ctx, alerts, command);
  };
  const t = toggles(ctx, doc, go);
  const all = [
    ...[t.mute, t.deafen, t.video],
    ...windowButtons(ctx, doc, handlers),
    ...sessionButtons(ctx, doc, go, status),
  ];
  const buttons = el("div", {
    doc,
    className: "mav-dock-buttons",
    attrs: { role: "toolbar", "aria-label": ctx.t("panel.label") },
    children: all.map((b) => b.element),
  });
  const keys = roving(buttons, { items: "button:not([hidden])" });
  status.onChange(() => {
    keys.refresh();
  });
  const off = ctx.api.state.subscribe(
    (s) => s.local,
    () => {
      renderLocal(ctx, t, warnings);
    },
  );
  renderLocal(ctx, t, warnings);
  const connection = createConnectionLine(ctx, doc, (anchor) => {
    handlers.connection(anchor);
  });
  return {
    element: el("section", {
      doc,
      className: "mav-dock-panel",
      attrs: { "aria-label": ctx.t("panel.label") },
      children: [connection.element, warnings, buttons, alerts],
    }),
    connection,
    dispose() {
      off();
      keys.dispose();
      connection.dispose();
    },
  };
}
