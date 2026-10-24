import type { DockContext } from "../context.ts";

/** A command's message (the core's default English) or the error's name. */
const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs a command and, if it fails, tells the player in `alerts` (a live
 * region) why; the core's state shows what really happened either way.
 */
export function run(
  ctx: DockContext,
  alerts: HTMLElement | null,
  command: () => Promise<unknown>,
): void {
  command().catch((error: unknown) => {
    ctx.onError(error);
    if (alerts)
      alerts.textContent = ctx.t("panel.failed", { reason: reasonOf(error) });
  });
}
