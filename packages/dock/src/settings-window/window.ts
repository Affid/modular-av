import type { SettingsHost } from "@modular-av/api";
import { el } from "@modular-av/kit";
import {
  type Rendered,
  renderContributedControls,
} from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { contributedSections } from "./contributed.ts";
import { createDraft, type Draft } from "./draft.ts";
import type { DraftKey } from "./draft-fields.ts";
import { section } from "./fields.ts";
import { createFooter } from "./footer.ts";
import { appearanceTab } from "./tab-appearance.ts";
import { callTab } from "./tab-call.ts";
import { videoTab } from "./tab-video.ts";
import { voiceTab } from "./tab-voice.ts";
import { createTabs, type TabSpec } from "./tabs.ts";

/** The tab each of the window's own fields is on. */
const TAB_OF: Readonly<Record<Exclude<DraftKey, "effects">, string>> = {
  service: "call",
  worldMode: "call",
  relay: "call",
  audioInput: "voice",
  audioOutput: "voice",
  voiceMode: "voice",
  pttKey: "voice",
  sensitivityAuto: "voice",
  threshold: "voice",
  videoInput: "video",
  receiveVideo: "video",
  theme: "appearance",
  camerasOwn: "appearance",
  camerasWorld: "appearance",
  settingsWindow: "appearance",
};

/** The tabs with unsaved changes; an effect's is its kind's tab. */
function unsavedTabs(ctx: DockContext, draft: Draft): ReadonlySet<string> {
  const tabs = new Set<string>();
  for (const key of draft.changed()) {
    if (key !== "effects") tabs.add(TAB_OF[key]);
  }
  const now = draft.get("effects");
  const was = draft.savedValue("effects");
  for (const d of ctx.api.effects.list()) {
    const group = d.exclusiveGroup ?? d.id;
    if ((now[group] ?? "") !== (was[group] ?? ""))
      tabs.add(d.kind === "audio" ? "voice" : "video");
  }
  return tabs;
}

/** Other modules' sections naming no tab, and their settings controls. */
function moreTab(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  const controls = renderContributedControls(ctx, doc, "settings", alerts);
  const sections = contributedSections(ctx, doc, alerts, null);
  return [
    ...(controls.length
      ? [
          {
            element: section(
              doc,
              ctx.t("tabs.more"),
              controls.map((c) => c.element),
            ),
            dispose() {
              for (const c of controls) c.dispose();
            },
          },
        ]
      : []),
    ...sections,
  ];
}

function tabSpecs(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  host: SettingsHost,
  alerts: HTMLElement,
): TabSpec[] {
  const untabbed = ctx.api.contributions
    .list()
    .some(
      (c) =>
        (c.kind === "settings-section" && c.tab === undefined) ||
        (c.kind === "control" &&
          c.place === "settings" &&
          c.effect === undefined),
    );
  return [
    {
      id: "call",
      label: ctx.t("tabs.call"),
      render: () => callTab(ctx, doc, draft, host, alerts),
    },
    {
      id: "voice",
      label: ctx.t("tabs.voice"),
      render: () => voiceTab(ctx, doc, draft, host, alerts),
    },
    {
      id: "video",
      label: ctx.t("tabs.video"),
      render: () => videoTab(ctx, doc, draft, alerts),
    },
    {
      id: "appearance",
      label: ctx.t("tabs.appearance"),
      render: () => appearanceTab(ctx, doc, draft, alerts),
    },
    ...(untabbed
      ? [
          {
            id: "more",
            label: ctx.t("tabs.more"),
            render: () => moreTab(ctx, doc, alerts),
          },
        ]
      : []),
  ];
}

/**
 * The "Voice & Video Settings" window: tabs for the call, voice, video and
 * appearance (and other modules' own), every change drafted until Save.
 * Returns what undoes it.
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
  const draft = createDraft(ctx);
  const tabs = createTabs(doc, tabSpecs(ctx, doc, draft, host, alerts), {
    list: ctx.t("tabs.label"),
    unsaved: (tab) => ctx.t("tabs.unsaved", { tab }),
    ...(host.tab ? { first: host.tab } : {}),
  });
  const footer = createFooter(ctx, doc, draft, alerts);
  const mark = (): void => {
    const unsaved = unsavedTabs(ctx, draft);
    tabs.mark((id) => unsaved.has(id));
  };
  const offDraft = draft.subscribe(mark);
  // Changes made elsewhere (the quick controls) show in untouched fields.
  const offState = ctx.api.state.subscribe(
    (s) => s.local,
    () => {
      draft.sync();
    },
  );
  host.content.replaceChildren(
    el("div", {
      doc,
      className: "mav-settings",
      children: [tabs.element, alerts, footer.element],
    }),
  );
  return () => {
    offDraft();
    offState();
    tabs.dispose();
    footer.dispose();
  };
}
