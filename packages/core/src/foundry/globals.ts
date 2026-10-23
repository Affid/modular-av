/**
 * The parts of Foundry's globals the core uses. Kept narrow on purpose: it
 * grows with the core, and the fake Foundry in @modular-av/testing satisfies
 * it structurally.
 */
export interface FoundryModule {
  readonly id: string;
  readonly version: string;
  api?: unknown;
}

export interface FoundryGame {
  readonly modules: ReadonlyMap<string, FoundryModule>;
}

export interface FoundryHooks {
  once(hook: string, fn: () => void): number;
}

declare global {
  var game: FoundryGame;
  var Hooks: FoundryHooks;
}
