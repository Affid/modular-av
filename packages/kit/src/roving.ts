/**
 * One tab stop for a group (a toolbar, the tiles, a menu): arrow keys move
 * between its items, Home and End go to the ends, and the group keeps the
 * item last focused as its tab stop.
 */

export interface RovingOptions {
  /** A selector for the items, inside the group. */
  readonly items: string;
  readonly orientation?: "horizontal" | "vertical" | "both";
}

export interface Roving {
  /** Items came or went: keep exactly one tab stop. */
  refresh(): void;
  dispose(): void;
}

const NEXT: Readonly<Record<string, readonly string[]>> = {
  horizontal: ["ArrowRight"],
  vertical: ["ArrowDown"],
  both: ["ArrowRight", "ArrowDown"],
};
const PREVIOUS: Readonly<Record<string, readonly string[]>> = {
  horizontal: ["ArrowLeft"],
  vertical: ["ArrowUp"],
  both: ["ArrowLeft", "ArrowUp"],
};

export function roving(group: HTMLElement, options: RovingOptions): Roving {
  const orientation = options.orientation ?? "horizontal";
  const items = (): HTMLElement[] =>
    Array.from(group.querySelectorAll<HTMLElement>(options.items));

  const stop = (target: HTMLElement): void => {
    for (const item of items()) item.tabIndex = item === target ? 0 : -1;
  };

  const refresh = (): void => {
    const all = items();
    const current = all.find((i) => i.tabIndex === 0) ?? all[0];
    if (current) stop(current);
  };

  const target = (key: string, index: number, count: number): number | null => {
    if (NEXT[orientation]?.includes(key)) return (index + 1) % count;
    if (PREVIOUS[orientation]?.includes(key))
      return (index - 1 + count) % count;
    if (key === "Home") return 0;
    if (key === "End") return count - 1;
    return null;
  };

  const onKey = (event: KeyboardEvent): void => {
    const all = items();
    const index = all.findIndex((i) => i.contains(event.target as Node));
    if (index < 0) return;
    const next = target(event.key, index, all.length);
    const item = next === null ? undefined : all[next];
    if (!item) return;
    event.preventDefault();
    stop(item);
    item.focus();
  };

  const onFocus = (event: FocusEvent): void => {
    const item = items().find((i) => i === event.target);
    if (item) stop(item);
  };

  group.addEventListener("keydown", onKey);
  group.addEventListener("focusin", onFocus);
  refresh();
  return {
    refresh,
    dispose() {
      group.removeEventListener("keydown", onKey);
      group.removeEventListener("focusin", onFocus);
    },
  };
}
