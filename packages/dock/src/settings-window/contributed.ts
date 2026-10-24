import type { SettingsSectionContribution } from "@modular-av/api";
import { el } from "@modular-av/kit";
import {
  byOrder,
  type Rendered,
  renderControl,
} from "../contributions/controls.ts";
import type { DockContext, FoundrySettingConfig } from "../context.ts";
import { run } from "../ui/run.ts";
import { row, section } from "./fields.ts";

/** One Foundry setting, from its registration; world settings for GMs only. */
function foundryField(
  ctx: DockContext,
  doc: Document,
  config: FoundrySettingConfig,
  secret: boolean,
  alerts: HTMLElement,
): HTMLElement {
  const value = ctx.settings.get(config.namespace, config.key);
  const write = (next: unknown): void => {
    run(ctx, alerts, () =>
      ctx.settings.set(config.namespace, config.key, next),
    );
  };
  let control: HTMLInputElement | HTMLSelectElement;
  if (config.type === Boolean) {
    control = el("input", { doc, attrs: { type: "checkbox" } });
    control.checked = value === true;
    control.addEventListener("change", () => {
      write((control as HTMLInputElement).checked);
    });
  } else if (config.choices) {
    control = el("select", {
      doc,
      children: Object.entries(config.choices).map(([v, label]) =>
        el("option", { doc, text: ctx.text(label), attrs: { value: v } }),
      ),
    });
    control.value = String(value);
    control.addEventListener("change", () => {
      write(control.value);
    });
  } else {
    control = textInput(doc, config, value, secret);
    control.addEventListener("change", () => {
      const raw = control.value;
      if (secret && raw === "") return;
      write(config.type === Number ? Number(raw) : raw);
    });
  }
  return row(
    doc,
    ctx.text(config.name ?? config.key),
    control,
    config.hint ? ctx.text(config.hint) : undefined,
  );
}

/** A secret's field starts empty: its value never reaches the page. */
function textInput(
  doc: Document,
  config: FoundrySettingConfig,
  value: unknown,
  secret: boolean,
): HTMLInputElement {
  const range = config.range;
  const input = el("input", {
    doc,
    attrs: {
      type: secret
        ? "password"
        : config.type === Number
          ? range
            ? "range"
            : "number"
          : "text",
      autocomplete: secret ? "new-password" : "off",
      ...(range
        ? {
            min: String(range.min),
            max: String(range.max),
            step: String(range.step),
          }
        : {}),
    },
  });
  if (!secret)
    input.value =
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : "";
  return input;
}

/** A settings section another module contributed. */
function contributedSection(
  ctx: DockContext,
  doc: Document,
  c: SettingsSectionContribution,
  alerts: HTMLElement,
): Rendered {
  const secrets = new Set(c.secrets ?? []);
  const fields = c.settings.flatMap((key) => {
    const config = ctx.foundrySetting(key);
    if (!config || (config.scope === "world" && !ctx.isGM)) return [];
    return [foundryField(ctx, doc, config, secrets.has(key), alerts)];
  });
  const controls = (c.controls ?? []).map((control) =>
    renderControl(ctx, doc, control, alerts),
  );
  const element = section(doc, ctx.text(c.label), [
    ...fields,
    ...controls.map((r) => r.element),
  ]);
  element.dataset.contribution = c.id;
  element.hidden = fields.length === 0 && controls.length === 0;
  return {
    element,
    dispose() {
      for (const r of controls) r.dispose();
    },
  };
}

export function contributedSections(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  return ctx.api.contributions
    .list()
    .filter(
      (c): c is SettingsSectionContribution => c.kind === "settings-section",
    )
    .sort(byOrder)
    .map((c) => contributedSection(ctx, doc, c, alerts));
}
