import type { AudioPlace, LocalState } from "@modular-av/api";
import { type Offer, offersFor, type Slot, slotOf } from "../model/rack.ts";
import type { Writer } from "../model/queue.ts";
import { nameOf } from "./card.ts";
import type { ChainData } from "./chain-data.ts";
import type { MixerContext } from "./context.ts";
import { effectBrowser, readRecent, rememberRecent } from "./effect-browser.ts";
import {
  effectSettings,
  gateSettings,
  type SettingsHandlers,
} from "./effect-settings.ts";
import { byField } from "./fields.ts";
import { openPop, type Pop, type PopContent } from "./popover.ts";

export type PopKind = "settings" | "gate" | "browser";

export interface PopRequest {
  readonly kind: PopKind;
  /** A card's key, a place for the browser, "gate" for the gate. */
  readonly key: string;
  readonly anchor: HTMLElement;
}

/** An open pop-up to bring back once the chain is redrawn under it. */
export interface Kept {
  readonly kind: PopKind;
  readonly key: string;
  readonly field: string | undefined;
}

export interface Pops {
  /** Opens it, or closes it if it is the one open (its anchor pressed again). */
  show(request: PopRequest): void;
  close(): void;
  keep(): Kept | null;
  restore(kept: Kept): void;
  /** A settings pop-up says Switch on or off, so it follows its card. */
  follow(local: LocalState): void;
}

export interface PopsDeps {
  readonly ctx: MixerContext;
  readonly doc: Document;
  readonly root: HTMLElement;
  readonly writes: Writer;
  data(): ChainData;
  settings(): SettingsHandlers;
  pick(offer: Offer, place: AudioPlace): void;
}

const storageOf = (doc: Document): Storage | null => {
  try {
    return doc.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
};

const onOf = (slot: Slot, local: Pick<LocalState, "chosenEffects">): string =>
  `${slot.key}:${String(local.chosenEffects.includes(slot.effect.id))}`;

const ANCHORS: Readonly<Record<PopKind, (key: string) => string>> = {
  settings: (key) => `settings.${key}`,
  gate: () => "settings.gate",
  browser: (key) => `add.${key}`,
};

export function createPops(deps: PopsDeps): Pops {
  const { ctx, doc, root } = deps;
  let pop: Pop | null = null;
  /** What the open settings pop-up was drawn for. */
  let drawnFor = "";

  const build = (
    request: PopRequest,
    slot: Slot | undefined,
    close: () => void,
  ): PopContent => {
    const data = deps.data();
    if (request.kind === "gate") return gateSettings(ctx, doc, deps.writes);
    if (request.kind === "browser") {
      const place = request.key as AudioPlace;
      const recent = readRecent(storageOf(doc));
      const offers = offersFor(
        data.definitions,
        data.local,
        data.racks,
        place,
        recent,
      );
      return effectBrowser(ctx, doc, place, offers, (offer) => {
        rememberRecent(storageOf(doc), offer.key);
        close();
        deps.pick(offer, place);
      });
    }
    if (!slot) throw new Error("No card to set");
    return effectSettings(ctx, doc, data, slot, deps.writes, deps.settings());
  };

  const titleOf = (request: PopRequest, slot: Slot | undefined): string => {
    if (request.kind === "gate") return ctx.t("gate");
    if (request.kind === "browser") return ctx.t(`addTo.${request.key}`);
    return slot ? nameOf(ctx, slot) : "";
  };

  const open = (request: PopRequest): Pop | null => {
    pop?.close(false);
    const data = deps.data();
    const slot = slotOf(data.racks, request.key);
    if (request.kind === "settings" && !slot) return null;
    drawnFor =
      slot && request.kind === "settings" ? onOf(slot, data.local) : "";
    pop = openPop(ctx, doc, root, {
      ...request,
      title: titleOf(request, slot),
      onClosed: () => {
        pop = null;
      },
      build: (close) => build(request, slot, close),
    });
    return pop;
  };

  const keep = (): Kept | null => {
    if (!pop) return null;
    const active = doc.activeElement as HTMLElement | null;
    const inside = active !== null && pop.element.contains(active);
    return {
      kind: pop.kind as PopKind,
      key: pop.key,
      field: inside ? active.dataset.field : undefined,
    };
  };

  const restore = (kept: Kept): void => {
    const anchor = byField(root, ANCHORS[kept.kind](kept.key));
    if (!anchor) return;
    const reopened = open({ kind: kept.kind, key: kept.key, anchor });
    if (reopened && kept.field) byField(reopened.element, kept.field)?.focus();
  };

  return {
    show(request) {
      if (pop?.kind === request.kind && pop.key === request.key) {
        pop.close(true);
        return;
      }
      open(request);
    },
    close() {
      pop?.close(false);
    },
    keep,
    restore,
    follow(local) {
      if (pop?.kind !== "settings") return;
      const slot = slotOf(deps.data().racks, pop.key);
      if (!slot || onOf(slot, local) === drawnFor) return;
      const kept = keep();
      if (kept) restore(kept);
    },
  };
}
