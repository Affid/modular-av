/** What a package in the family is, read from `flags["modular-av"].kind`. */
export type ModuleKind = "service" | "effect" | "ui" | "theme";

/** The `flags["modular-av"]` block of a module's `module.json`. */
export interface ModularAVModuleFlags {
  readonly kind: ModuleKind;
}
