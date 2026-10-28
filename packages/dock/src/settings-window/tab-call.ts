import type { SettingsHost } from "@modular-av/api";
import { el, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { contributedSections } from "./contributed.ts";
import type { Draft } from "./draft.ts";
import { WORLD_MODES, type WorldMode } from "./draft-fields.ts";
import { draftSelect, settingChoices } from "./draft-inputs.ts";
import { row, section } from "./fields.ts";

const MODES = Object.keys(WORLD_MODES) as WorldMode[];

/** Off, voice, video or both for the world: Foundry's own world mode. */
function worldModes(ctx: DockContext, doc: Document, draft: Draft): Rendered {
  const buttons = MODES.map((mode) => {
    const button = el("button", {
      doc,
      className: "mav-effect-choice",
      text: ctx.t(`call.mode-${mode}`),
      attrs: { type: "button", "data-mode": mode },
    });
    button.addEventListener("click", () => {
      draft.set("worldMode", mode);
    });
    return button;
  });
  const render = (): void => {
    for (const b of buttons)
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.mode === draft.get("worldMode")),
      );
  };
  render();
  const id = uniqueId(doc, "mav-world-mode");
  const element = section(doc, ctx.t("call.world"), [
    el("div", {
      doc,
      className: "mav-effect-choices",
      attrs: { role: "group", "aria-labelledby": id },
      children: buttons,
    }),
    el("p", {
      doc,
      className: "mav-settings-hint",
      text: ctx.t("call.worldHint"),
    }),
  ]);
  element.querySelector("h2")?.setAttribute("id", id);
  return { element, dispose: draft.subscribe(render) };
}

const RELAY_FIELDS = ["url", "username", "password"] as const;
type RelayField = (typeof RELAY_FIELDS)[number];

/** One of the GM's relay fields: drafted when it changes. */
function relayInput(
  doc: Document,
  draft: Draft,
  key: RelayField,
): HTMLInputElement {
  const field = el("input", {
    doc,
    attrs: {
      type: key === "password" ? "password" : "text",
      autocomplete: key === "password" ? "new-password" : "off",
      "data-field": `relay-${key}`,
    },
  });
  field.addEventListener("change", () => {
    draft.set("relay", { ...draft.get("relay"), [key]: field.value });
  });
  return field;
}

const relayType = (ctx: DockContext, doc: Document): HTMLSelectElement =>
  el("select", {
    doc,
    attrs: { "data-field": "relayType" },
    children: (["server", "custom"] as const).map((v) =>
      el("option", {
        doc,
        text: ctx.t(`call.relay-${v}`),
        attrs: { value: v },
      }),
    ),
  });

/** Foundry's relay server, which P2P uses: Foundry's own, or the GM's. */
function relay(ctx: DockContext, doc: Document, draft: Draft): Rendered {
  const type = relayType(ctx, doc);
  const fields = {
    url: relayInput(doc, draft, "url"),
    username: relayInput(doc, draft, "username"),
    password: relayInput(doc, draft, "password"),
  };
  const custom = el("div", {
    doc,
    className: "mav-settings-group",
    children: RELAY_FIELDS.map((k) =>
      row(doc, ctx.t(`call.relay-${k}`), fields[k]),
    ),
  });
  type.addEventListener("change", () => {
    draft.set("relay", {
      ...draft.get("relay"),
      type: type.value === "custom" ? "custom" : "server",
    });
  });
  const render = (): void => {
    const value = draft.get("relay");
    type.value = value.type;
    custom.hidden = value.type !== "custom";
    for (const k of RELAY_FIELDS)
      if (doc.activeElement !== fields[k]) fields[k].value = value[k];
  };
  render();
  const element = section(doc, ctx.t("call.relay"), [
    row(doc, ctx.t("call.relayType"), type, ctx.t("call.relayHint")),
    custom,
  ]);
  return { element, dispose: draft.subscribe(render) };
}

/** A player sees whether calls are on, and who carries them. */
function callState(ctx: DockContext, doc: Document): HTMLElement {
  const { worldMode, service } = ctx.api.state.get();
  const on = worldMode.audio || worldMode.video;
  const label = service.id
    ? ctx.api.services.get(service.id)?.label
    : undefined;
  return section(doc, ctx.t("call.world"), [
    el("p", {
      doc,
      className: "mav-call-state",
      attrs: { "data-on": String(on) },
      text: !on
        ? ctx.t("call.off")
        : label
          ? ctx.t("call.onBy", { service: ctx.text(label) })
          : ctx.t("call.on"),
    }),
  ]);
}

function gmLinks(
  ctx: DockContext,
  doc: Document,
  host: SettingsHost,
): HTMLElement {
  const link = (text: string, run: () => void) => {
    const b = el("button", {
      doc,
      className: "mav-control-button",
      text,
      attrs: { type: "button" },
    });
    b.addEventListener("click", run);
    return b;
  };
  return section(doc, ctx.t("settings.modulesTitle"), [
    el("p", {
      doc,
      className: "mav-settings-hint",
      text: ctx.t("settings.modulesHint"),
    }),
    el("div", {
      doc,
      className: "mav-settings-actions",
      children: [
        host.openModules
          ? link(ctx.t("settings.modules"), () => host.openModules?.())
          : null,
        link(ctx.t("settings.foundry"), () => {
          host.openFoundrySettings();
        }),
      ],
    }),
  ]);
}

/** The Call tab: what turns calls on and carries them (GMs set it). */
export function callTab(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  host: SettingsHost,
  alerts: HTMLElement,
): readonly Rendered[] {
  const contributed = contributedSections(ctx, doc, alerts, "call");
  if (!ctx.isGM)
    return [
      { element: callState(ctx, doc), dispose: () => undefined },
      ...contributed,
    ];
  const service = draftSelect(doc, draft, "service", () =>
    settingChoices(ctx.foundrySetting("modular-av.service")?.choices, ctx.text),
  );
  return [
    worldModes(ctx, doc, draft),
    {
      element: section(doc, ctx.t("call.service"), [
        row(
          doc,
          ctx.t("call.serviceLabel"),
          service.element,
          ctx.t("call.serviceHint"),
        ),
      ]),
      dispose: () => {
        service.dispose();
      },
    },
    relay(ctx, doc, draft),
    ...contributed,
    { element: gmLinks(ctx, doc, host), dispose: () => undefined },
  ];
}
