/**
 * The core's public API on `game.modules.get("modular-av").api`.
 *
 * DRAFT: milestone 2 adds the state store, commands, registries and the
 * rest of handoff §3 "Extension points". Its version is the core's module
 * version, so Foundry's dependency checks apply to the API.
 */
export interface ModularAV {
  readonly version: string;
}
