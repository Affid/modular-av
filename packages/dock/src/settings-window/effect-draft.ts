import type { EffectDefinition } from "@modular-av/api";
import type { EffectModel } from "../panel/effects.ts";
import type { Draft } from "./draft.ts";

const nameOf = (group: readonly EffectDefinition[]): string =>
  group[0]?.exclusiveGroup ?? group[0]?.id ?? "";

/** Effect choices kept in the draft until Save. */
export function draftEffects(draft: Draft): EffectModel {
  return {
    chosen: (group) => draft.get("effects")[nameOf(group)] ?? "",
    choose(group, id) {
      draft.set("effects", { ...draft.get("effects"), [nameOf(group)]: id });
    },
    subscribe: (listener) => draft.subscribe(listener),
  };
}
