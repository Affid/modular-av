import type { SettingsSectionContribution, SettingsTab } from "@modular-av/api";
import { el } from "@modular-av/kit";
import {
  byOrder,
  type Rendered,
  renderControl,
} from "../contributions/controls.ts";
import type { DockContext, FoundrySettingConfig } from "../context.ts";
import { run } from "../ui/run.ts";
import { row, section } from "./fields.ts";

/** Only plain values: an object setting edited as text would be lost. */
const isPlain = (config: FoundrySettingConfig): boolean =>
  config.choices !== undefined ||
  config.type === String ||
  config.type === Number ||
  config.type === Boolean;

/**
 * A secret: a password field that starts empty and never reads the value,
 * whatever the setting's type; a failed write never repeats what was typed.
 */
function secretField(
  ctx: DockContext,
  doc: Document,
  config: FoundrySettingConfig,
  alerts: HTMLElement,
): HTMLInputElement {
  const input = el("input", {
    doc,
    attrs: { type: "password", autocomplete: "new-password" },
  });
  input.addEventListener("change", () => {
    const typed = input.value;
    input.value = "";
    if (typed === "") return;
    ctx.settings
      .set(config.namespace, config.key, typed)
      .catch((error: unknown) => {
        ctx.onError(new Error(`Saving a secret failed (${errorName(error)})`));
        alerts.textContent = ctx.t("panel.failedSecret");
      });
  });
  return input;
}

const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : "Error";

function plainField(
  ctx: DockContext,
  doc: Document,
  config: FoundrySettingConfig,
  alerts: HTMLElement,
): HTMLInputElement | HTMLSelectElement {
  const value = ctx.settings.get(config.namespace, config.key);
  const write = (next: unknown): void => {
    run(ctx, alerts, () =>
      ctx.settings.set(config.namespace, config.key, next),
    );
  };
  if (config.type === Boolean) {
    const box = el("input", { doc, attrs: { type: "checkbox" } });
    box.checked = value === true;
    box.addEventListener("change", () => {
      write(box.checked);
    });
    return box;
  }
  if (config.choices) {
    const select = el("select", {
      doc,
      children: Object.entries(config.choices).map(([v, label]) =>
        el("option", { doc, text: ctx.text(label), attrs: { value: v } }),
      ),
    });
    select.value = String(value);
    select.addEventListener("change", () => {
      write(select.value);
    });
    return select;
  }
  const input = textInput(doc, config, value);
  input.addEventListener("change", () => {
    const next = config.type === Number ? Number(input.value) : input.value;
    if (typeof next === "number" && !Number.isFinite(next)) return;
    write(next);
  });
  return input;
}

/** One Foundry setting, from its registration; world settings for GMs only. */
function foundryField(
  ctx: DockContext,
  doc: Document,
  config: FoundrySettingConfig,
  secret: boolean,
  alerts: HTMLElement,
): HTMLElement | null {
  if (!secret && !isPlain(config)) return null;
  const control = secret
    ? secretField(ctx, doc, config, alerts)
    : plainField(ctx, doc, config, alerts);
  return row(
    doc,
    ctx.text(config.name ?? config.key),
    control,
    config.hint ? ctx.text(config.hint) : undefined,
  );
}

function textInput(
  doc: Document,
  config: FoundrySettingConfig,
  value: unknown,
): HTMLInputElement {
  const range = config.range;
  const number = config.type === Number;
  const input = el("input", {
    doc,
    attrs: {
      type: number ? (range ? "range" : "number") : "text",
      autocomplete: "off",
      ...(range
        ? {
            min: String(range.min),
            max: String(range.max),
            step: String(range.step),
          }
        : {}),
    },
  });
  input.value =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
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
    const field = foundryField(ctx, doc, config, secrets.has(key), alerts);
    return field ? [field] : [];
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

/** Other modules' sections for a tab: `null` for those naming none. */
export function contributedSections(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
  tab: SettingsTab | null,
): readonly Rendered[] {
  return ctx.api.contributions
    .list()
    .filter(
      (c): c is SettingsSectionContribution =>
        c.kind === "settings-section" && (c.tab ?? null) === tab,
    )
    .sort(byOrder)
    .map((c) => contributedSection(ctx, doc, c, alerts));
}
