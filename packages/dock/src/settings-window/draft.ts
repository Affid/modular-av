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
  /** What is saved now for `key`. */
  savedValue<K extends DraftKey>(key: K): DraftValues[K];
  set<K extends DraftKey>(key: K, value: DraftValues[K]): void;
  /** Fields that differ from what is saved, in the window's order. */
  changed(): readonly DraftKey[];
  /** What saving now reloads: every page, this one, or none. */
  reloads(): "everyone" | "self" | null;
  reset(): void;
  /**
   * Applies what changed, in order, then reloads if one of them needs it.
   * Stops at the first that fails, keeping what was applied; one save at a
   * time (a second while one is under way waits for it).
   */
  save(): Promise<void>;
  saving(): boolean;
  /**
   * Follows what changed elsewhere (the quick controls): fields nobody
   * drafted take it, and Reset goes back to it.
   */
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
  let saving: Promise<void> | null = null;
  let listeners: readonly (() => void)[] = [];
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const mine = (key: DraftKey): boolean => ctx.isGM || !FIELDS[key].gm;
  const changed = (): readonly DraftKey[] =>
    KEYS.filter((key) => mine(key) && !same(draft[key], saved[key]));
  const reloads = (): "everyone" | "self" | null => {
    const needs = changed().map((key) => FIELDS[key].reload);
    if (needs.includes("everyone")) return ctx.isGM ? "everyone" : "self";
    return needs.includes("self") ? "self" : null;
  };
  const apply = async (): Promise<void> => {
    const reload = reloads();
    try {
      for (const key of changed()) {
        const value = draft[key];
        await applyOne(ctx, key, value);
        saved = { ...saved, [key]: value };
      }
    } finally {
      saving = null;
      notify();
    }
    if (reload) ctx.reload(reload === "everyone");
  };
  return {
    get: (key) => draft[key],
    savedValue: (key) => saved[key],
    set(key, value) {
      draft = { ...draft, [key]: value };
      notify();
    },
    changed,
    reloads,
    reset() {
      draft = saved;
      notify();
    },
    save() {
      if (!saving) {
        saving = apply();
        notify();
      }
      return saving;
    },
    saving: () => saving !== null,
    sync() {
      const now = readAll(ctx);
      const untouched = KEYS.filter((key) => same(draft[key], saved[key]));
      const follow = Object.fromEntries(untouched.map((k) => [k, now[k]]));
      saved = now;
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
