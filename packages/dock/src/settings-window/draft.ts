import type { DockContext } from "../context.ts";
import {
  type DraftKey,
  type DraftValues,
  type Field,
  FIELDS,
} from "./draft-fields.ts";

/**
 * The settings window's own fields between opening and Save: they change
 * nothing until saved, which says whether everyone's page reloads.
 */
export interface Draft {
  get<K extends DraftKey>(key: K): DraftValues[K];
  set<K extends DraftKey>(key: K, value: DraftValues[K]): void;
  /** Fields that differ from what is saved, in the window's order. */
  changed(): readonly DraftKey[];
  /** What saving now reloads: every page, this one, or none. */
  reloads(): "everyone" | "self" | null;
  reset(): void;
  /** Applies what changed, in order, then reloads if one of them needs it. */
  save(): Promise<void>;
  /** Fields nobody drafted follow what changed elsewhere (the quick controls). */
  sync(): void;
  subscribe(listener: () => void): () => void;
}

const KEYS = Object.keys(FIELDS) as DraftKey[];

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

function readAll(ctx: DockContext): DraftValues {
  return Object.fromEntries(
    KEYS.map((key) => [key, FIELDS[key].read(ctx)]),
  ) as unknown as DraftValues;
}

/** A field's apply, typed by its key (TypeScript can't pair them itself). */
const applyOne = (
  ctx: DockContext,
  key: DraftKey,
  value: DraftValues[DraftKey],
): Promise<void> =>
  (FIELDS[key] as unknown as Field<DraftKey>).apply(ctx, value);

export function createDraft(ctx: DockContext): Draft {
  let saved = readAll(ctx);
  let draft = saved;
  let listeners: readonly (() => void)[] = [];
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const mine = (key: DraftKey): boolean => ctx.isGM || !FIELDS[key].gm;
  const changed = (): readonly DraftKey[] =>
    KEYS.filter((key) => mine(key) && !same(draft[key], saved[key]));
  return {
    get: (key) => draft[key],
    set(key, value) {
      draft = { ...draft, [key]: value };
      notify();
    },
    changed,
    reloads() {
      const reloads = changed().map((key) => FIELDS[key].reload);
      if (reloads.includes("everyone")) return ctx.isGM ? "everyone" : "self";
      return reloads.includes("self") ? "self" : null;
    },
    reset() {
      draft = saved;
      notify();
    },
    async save() {
      const reload = this.reloads();
      for (const key of changed()) {
        await applyOne(ctx, key, draft[key]);
        saved = { ...saved, [key]: draft[key] };
      }
      notify();
      if (reload) ctx.reload(reload === "everyone");
    },
    sync() {
      const now = readAll(ctx);
      const untouched = KEYS.filter((key) => same(draft[key], saved[key]));
      const follow = Object.fromEntries(untouched.map((k) => [k, now[k]]));
      saved = { ...saved, ...follow };
      draft = { ...draft, ...follow };
      notify();
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
