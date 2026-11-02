import type { AVCommands } from "@modular-av/api";
import { setValue } from "../model/settings.ts";
import type { Plan } from "../model/snapshot.ts";

/** Off first, one pipeline write, settings, then on: see `Plan`. */
export async function runPlan(commands: AVCommands, plan: Plan): Promise<void> {
  for (const id of plan.off) await commands.setEffectEnabled(id, false);
  if (Object.keys(plan.change).length > 0)
    await commands.setAudioPipeline(plan.change);
  for (const { control, value } of plan.settings)
    await setValue(control, value);
  for (const id of plan.on) await commands.setEffectEnabled(id, true);
}
