/**
 * A plugin registry. `register` works only synchronously inside the
 * `modularAV.register` hook, fired once during Foundry's `setup`; later
 * calls throw.
 */
export interface Registry<T extends { readonly id: string }> {
  register(definition: T): void;
  list(): readonly T[];
  get(id: string): T | undefined;
  onChange(listener: (definitions: readonly T[]) => void): () => void;
}
