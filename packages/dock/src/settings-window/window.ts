import type { SettingsHost } from "@modular-av/api";
import { el } from "@modular-av/kit";
import {
  type Rendered,
  renderContributedControls,
} from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { renderEffects } from "../panel/effects.ts";
import { appearanceSection } from "./appearance.ts";
import { contributedSections } from "./contributed.ts";
import { section } from "./fields.ts";
import { devicesSection, videoSection, voiceSection } from "./sections.ts";

/** Foundry's own A/V settings keep the world's mode and relay server. */
function foundrySection(
  ctx: DockContext,
  doc: Document,
  host: SettingsHost,
): HTMLElement {
  const open = el("button", {
    doc,
    className: "mav-control-button",
    text: ctx.t("settings.foundry"),
    attrs: { type: "button" },
  });
  open.addEventListener("click", () => {
    host.openFoundrySettings();
  });
  return section(doc, ctx.t("settings.foundry"), [
    el("p", {
      doc,
      className: "mav-settings-hint",
      text: ctx.t("settings.foundryHint"),
    }),
    open,
  ]);
}

/** GMs: the core's modules window, to plan which modules the world runs. */
function modulesSection(
  ctx: DockContext,
  doc: Document,
  open: () => void,
): HTMLElement {
  const button = el("button", {
    doc,
    className: "mav-control-button",
    text: ctx.t("settings.modules"),
    attrs: { type: "button" },
  });
  button.addEventListener("click", open);
  return section(doc, ctx.t("settings.modulesTitle"), [
    el("p", {
      doc,
      className: "mav-settings-hint",
      text: ctx.t("settings.modulesHint"),
    }),
    button,
  ]);
}

/** No effect module here: say they exist; a GM can go plan them. */
function effectModulesHint(
  ctx: DockContext,
  doc: Document,
  host: SettingsHost,
): HTMLElement[] {
  const hint = el("p", {
    doc,
    className: "mav-settings-hint",
    text: ctx.t(host.openModules ? "effects.modulesGm" : "effects.modules"),
  });
  if (!host.openModules) return [hint];
  const plan = el("button", {
    doc,
    className: "mav-control-button",
    text: ctx.t("settings.modules"),
    attrs: { type: "button" },
  });
  plan.addEventListener("click", () => host.openModules?.());
  return [hint, plan];
}

/**
 * The "Voice & Video Settings" window: devices, voice, video, effects and
 * what other modules contributed. Returns what undoes its subscriptions.
 */
export function renderSettings(
  ctx: DockContext,
  host: SettingsHost,
): () => void {
  const doc = host.content.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const effects = renderEffects(ctx, doc, alerts);
  const extra = renderContributedControls(ctx, doc, "settings", alerts);
  const own: readonly Rendered[] = [
    ...devicesSection(ctx, doc, alerts),
    ...voiceSection(ctx, doc, alerts),
    ...videoSection(ctx, doc, alerts),
    ...appearanceSection(ctx, doc, alerts),
  ];
  const contributed = contributedSections(ctx, doc, alerts);
  const noEffects = effects.element.hidden && extra.length === 0;
  const effectsSection = section(
    doc,
    ctx.t("effects.title"),
    noEffects
      ? effectModulesHint(ctx, doc, host)
      : [effects.element, ...extra.map((e) => e.element)],
  );
  const form = el("div", {
    doc,
    className: "mav-settings",
    children: [
      ...own
        .map((p) => p.element)
        .filter((e) => e.classList.contains("mav-settings-section")),
      effectsSection,
      ...contributed.map((c) => c.element),
      foundrySection(ctx, doc, host),
      host.openModules
        ? modulesSection(ctx, doc, () => host.openModules?.())
        : null,
      alerts,
    ],
  });
  host.content.replaceChildren(form);
  return () => {
    for (const part of [...own, effects, ...extra, ...contributed])
      part.dispose();
  };
}
