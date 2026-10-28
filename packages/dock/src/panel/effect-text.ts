import type {
  EffectDefinition,
  EffectState,
  LocalState,
} from "@modular-av/api";
import type { DockContext } from "../context.ts";

export type Effects = LocalState["effects"];

const OFF: EffectState = { status: "off", error: null };

export const costText = (ctx: DockContext, d: EffectDefinition): string =>
  ctx.t(`effects.cost-${d.cost}`);

/** Why an effect failed, in words, if the dock has words for its error. */
function reasonText(ctx: DockContext, error: string | null): string | null {
  if (!error) return null;
  const key = `effects.errors.${error}`;
  const text = ctx.t(key);
  return text.endsWith(key) ? null : text;
}

/**
 * Said only while it matters: "Starting…", or why it failed. A running
 * effect needs no words: the choice shows it.
 */
export function stateText(
  ctx: DockContext,
  d: EffectDefinition,
  effects: Effects,
): string {
  const status = effects[d.id] ?? OFF;
  if (status.status === "starting") return ctx.t("effects.starting");
  if (status.status !== "failed") return "";
  const reason = reasonText(ctx, status.error);
  return reason
    ? ctx.t("effects.failedBecause", { reason })
    : `${ctx.t("effects.failed")} · ${costText(ctx, d)}`;
}

export const isOn = (status: EffectState | undefined): boolean =>
  status?.status === "starting" || status?.status === "running";
