import type { DeviceKind } from "@modular-av/api";
import type { DockContext } from "../context.ts";
import type { Option } from "./fields.ts";

/**
 * The devices of a kind, the system's first. A chosen device the browser
 * doesn't list now (unplugged) still shows, not as a blank.
 */
export function deviceOptions(
  ctx: DockContext,
  kind: DeviceKind,
  chosen: string,
): readonly Option[] {
  const listed = ctx.api.state.get().devices[kind].map((d, i) => ({
    value: d.id,
    label: d.label || ctx.t("settings.unnamed", { number: String(i + 1) }),
  }));
  const missing =
    chosen !== "default" && !listed.some((d) => d.value === chosen)
      ? [{ value: chosen, label: ctx.t("settings.missingDevice") }]
      : [];
  return [
    { value: "default", label: ctx.t("settings.systemDefault") },
    ...listed,
    ...missing,
  ];
}
