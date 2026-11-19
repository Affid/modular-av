/**
 * Runs `fn` once, `ms` after the last call: a settings form saves its
 * values one after the other, and work on them waits until all are in.
 */
export function debounced(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  };
}
