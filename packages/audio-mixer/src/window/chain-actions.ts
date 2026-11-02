import type { AudioPlace } from "@modular-av/api";
import {
  addTo,
  type ChainPlan,
  moveTo,
  moveWithin,
  NOISE_KEY,
  type Offer,
  PLACES,
  removeFrom,
  setOn,
  type Slot,
  slotOf,
  switchModel,
} from "../model/rack.ts";
import type { Writer } from "../model/queue.ts";
import {
  type ChainData,
  chainData,
  heldEntry,
  isPinned,
} from "./chain-data.ts";
import type { MixerContext } from "./context.ts";
import type { SettingsHandlers } from "./effect-settings.ts";
import { byField } from "./fields.ts";
import type { LevelsHandlers } from "./levels.ts";
import type { RoutingHandlers } from "./routing.ts";

export interface ActionsDeps {
  readonly ctx: MixerContext;
  readonly writes: Writer;
  readonly root: HTMLElement;
  select(key: string): void;
  /** The card that should have the keyboard once the chain is redrawn. */
  focusAfter(key: string): void;
  settings(key: string, anchor: HTMLElement): void;
  add(place: AudioPlace, anchor: HTMLElement): void;
  closePop(): void;
}

export interface Actions {
  readonly routing: RoutingHandlers;
  readonly levels: LevelsHandlers;
  readonly settings: SettingsHandlers;
  pick(offer: Offer, place: AudioPlace): void;
}

/** The chain as the core has it now, not as it was last drawn. */
export const currentChain = (ctx: MixerContext): ChainData =>
  chainData(
    ctx.api.effects.list(),
    ctx.api.state.get().local,
    ctx.layers?.held() ?? null,
    ctx.layers?.states() ?? [],
  );

/** A GM's layer holds the order of `place`. */
const placeHeld = (data: ChainData, place: AudioPlace): boolean =>
  data.held?.order?.[place] !== undefined;

/** Free to move: neither it nor where it goes is held. */
const movable = (data: ChainData, slot: Slot, to: AudioPlace): boolean =>
  !isPinned(data, slot) && !placeHeld(data, to);

/** What the player's own controls do, each checked against GM layers. */
export function createActions(deps: ActionsDeps): Actions {
  const { ctx, writes } = deps;
  const select = (key: string): void => {
    deps.select(key);
  };
  let serial = 0;
  /**
   * Plans are made when they run, from the chain then, so quick presses
   * build on each other; each gets its own key, so none replaces another.
   */
  const run = (build: (data: ChainData) => ChainPlan | null): void => {
    serial += 1;
    void writes.run(`chain:${String(serial)}`, async () => {
      const plan = build(currentChain(ctx));
      if (!plan) return;
      if (Object.keys(plan.change).length)
        await ctx.api.commands.setAudioPipeline(plan.change);
      for (const [id, on] of plan.enable)
        await ctx.api.commands.setEffectEnabled(id, on);
    });
  };
  const withSlot =
    (key: string, build: (data: ChainData, slot: Slot) => ChainPlan | null) =>
    (data: ChainData): ChainPlan | null => {
      const slot = slotOf(data.racks, key);
      return slot ? build(data, slot) : null;
    };
  const moveTowards = (key: string, place: AudioPlace, index?: number) => {
    deps.focusAfter(key);
    run(
      withSlot(key, (data, slot) =>
        movable(data, slot, place)
          ? moveTo(data.racks, key, place, index)
          : null,
      ),
    );
  };
  const toggle = (key: string): void => {
    run(
      withSlot(key, (data, slot) =>
        heldEntry(data, slot)?.on === undefined
          ? setOn(
              data.racks,
              key,
              !data.local.chosenEffects.includes(slot.effect.id),
            )
          : null,
      ),
    );
  };
  const remove = (key: string): void => {
    deps.closePop();
    run(
      withSlot(key, (data, slot) =>
        heldEntry(data, slot) ? null : removeFrom(data.racks, key),
      ),
    );
  };
  const routing: RoutingHandlers = {
    select,
    toggle,
    remove,
    move(key, by) {
      deps.focusAfter(key);
      run(
        withSlot(key, (data, slot) =>
          movable(data, slot, slot.place)
            ? moveWithin(data.racks, key, by)
            : null,
        ),
      );
    },
    shift(key, by) {
      const slot = slotOf(currentChain(ctx).racks, key);
      const place = slot && PLACES[PLACES.indexOf(slot.place) + by];
      if (place) moveTowards(key, place);
    },
    drop: moveTowards,
    settings: (key, anchor) => {
      deps.settings(key, anchor);
    },
    add: (place, anchor) => {
      deps.add(place, anchor);
    },
    toLevel(key) {
      const slot = slotOf(currentChain(ctx).racks, key);
      select(key);
      if (slot) byField(deps.root, `mix.${slot.effect.id}`)?.focus();
    },
  };
  return {
    routing,
    levels: {
      mix: (effect, level) => {
        void writes.run(`mix:${effect}`, () =>
          ctx.api.commands.setAudioEffectMix(effect, level),
        );
      },
      channel: (level) => {
        void writes.run("channel", () =>
          ctx.api.commands.setAudioChannelLevel(level),
        );
      },
      cutTails: (on) => {
        void writes.run("cutTails", () =>
          ctx.api.commands.setAudioCutTails(on),
        );
      },
      select,
    },
    settings: {
      place: (key, place) => {
        moveTowards(key, place);
      },
      toggle,
      remove,
      model: (id) => {
        run((data) => {
          const slot = slotOf(data.racks, NOISE_KEY);
          return slot && !heldEntry(data, slot)
            ? switchModel(data.racks, id, data.local)
            : null;
        });
      },
    },
    pick(offer, place) {
      deps.focusAfter(offer.key);
      run((data) =>
        placeHeld(data, place) ? null : addTo(data.racks, offer.effect, place),
      );
    },
  };
}
