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
  /** Whether the save under way changes `key`, synced meanwhile or not. */
  applying(key: DraftKey): boolean;
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

type Reload = "everyone" | "self" | null;

/** The fields this player may save that differ from what is saved. */
const changedKeys = (
  ctx: DockContext,
  draft: DraftValues,
  saved: DraftValues,
): readonly DraftKey[] =>
  KEYS.filter(
    (key) => (ctx.isGM || !FIELDS[key].gm) && !same(draft[key], saved[key]),
  );

/** What saving `keys` reloads: every page (a GM's save), this one, or none. */
function reloadsOf(ctx: DockContext, keys: readonly DraftKey[]): Reload {
  const needs = keys.map((key) => FIELDS[key].reload);
  if (needs.includes("everyone")) return ctx.isGM ? "everyone" : "self";
  return needs.includes("self") ? "self" : null;
}

/** What is saved now; the fields nobody drafted follow it. */
function synced(
  ctx: DockContext,
  draft: DraftValues,
  saved: DraftValues,
): { readonly saved: DraftValues; readonly draft: DraftValues } {
  const now = readAll(ctx);
  const untouched = KEYS.filter((key) => same(draft[key], saved[key]));
  const follow = Object.fromEntries(untouched.map((k) => [k, now[k]]));
  return { saved: now, draft: { ...draft, ...follow } };
}

/** A save: the draft as it was then, whatever is drafted meanwhile. */
interface SaveRun {
  readonly values: DraftValues;
  readonly keys: readonly DraftKey[];
  readonly reload: Reload;
}

/** Applies a save's fields in order, each reported once applied. */
async function applyInOrder(
  ctx: DockContext,
  run: SaveRun,
  onApplied: (key: DraftKey) => void,
): Promise<void> {
  for (const key of run.keys) {
    await applyOne(ctx, key, run.values[key]);
    onApplied(key);
  }
}

function createListeners() {
  let listeners: readonly (() => void)[] = [];
  return {
    notify: (): void => {
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}

export function createDraft(ctx: DockContext): Draft {
  let saved = readAll(ctx);
  let draft = saved;
  let saving: Promise<void> | null = null;
  let applying: readonly DraftKey[] = [];
  const { notify, subscribe } = createListeners();
  const changed = (): readonly DraftKey[] => changedKeys(ctx, draft, saved);
  const reloads = (): Reload => reloadsOf(ctx, changed());
  const apply = async (run: SaveRun): Promise<void> => {
    try {
      await applyInOrder(ctx, run, (key) => {
        saved = { ...saved, [key]: run.values[key] };
      });
    } finally {
      saving = null;
      applying = [];
      notify();
    }
    if (run.reload) ctx.reload(run.reload === "everyone");
  };
  return {
    get: (key) => draft[key],
    savedValue: (key) => saved[key],
    set(key, value) {
      draft = { ...draft, [key]: value };
      notify();
    },
    ...{ changed, reloads, subscribe },
    reset() {
      draft = saved;
      notify();
    },
    save() {
      if (!saving) {
        // Saving shows before any field applies (the camera preview stops).
        const run = { values: draft, keys: changed(), reload: reloads() };
        applying = run.keys;
        saving = Promise.resolve().then(() => apply(run));
        notify();
      }
      return saving;
    },
    saving: () => saving !== null,
    applying: (key) => applying.includes(key),
    sync() {
      ({ saved, draft } = synced(ctx, draft, saved));
      notify();
    },
  };
}
