/** Seeded random numbers: the same art from the same seed, on any machine. */
export interface Random {
  /** From 0 up to, not including, 1. */
  next(): number;
  between(low: number, high: number): number;
  pick<T>(list: readonly [T, ...T[]]): T;
}

/** The mulberry32 generator. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    const mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    const again =
      (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((again ^ (again >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (low, high) => low + (high - low) * next(),
    pick: (list) => list[Math.floor(next() * list.length)] ?? list[0],
  };
}
