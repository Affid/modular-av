/**
 * One named channel on the core's multiplexed socket (`module.modular-av`).
 * Data must survive structured cloning; receivers validate it.
 */
export interface Channel {
  /** To every other client, or with `recipients` to those users' clients. */
  send(
    data: unknown,
    options?: { readonly recipients?: readonly string[] },
  ): void;
  /** `senderId` is authenticated by Foundry's server. */
  on(handler: (data: unknown, senderId: string) => void): () => void;
}
