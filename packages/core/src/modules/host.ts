import type { Catalog } from "../catalog/catalog.ts";
import type { CheckTarget, SectionInfo } from "./board/objectives.ts";
import type { WorldModules } from "./steps.ts";

/** What the board keeps in the world between visits. */
export interface SavedPlan {
  readonly plan: readonly string[];
  /** What was left to install when the GM left for Setup, or null. */
  readonly trip: readonly string[] | null;
}

/** Where the catalog came from, for the line under the title. */
export type CatalogSource = "github" | "bundled" | "offline" | "off";

export interface LoadedCatalog {
  readonly catalog: Catalog;
  readonly source: CatalogSource;
  /** The modules the catalog shipped with the core knows: the rest are new. */
  readonly known: ReadonlySet<string>;
}

/** What Apply changes, all at once, before everyone reloads. */
export interface ApplyChange {
  readonly on: readonly string[];
  readonly off: readonly string[];
  /** A UI module turned on: its cameras and settings window become the world's. */
  readonly ui: string | null;
}

/**
 * Everything the board needs from Foundry: one seam, faked in tests.
 * Texts come localized; the rest are actions with their side effects.
 */
export interface BoardHost {
  readonly doc: Document;
  t(key: string, data?: Readonly<Record<string, string>>): string;
  /** The family modules installed, the core included. */
  world(): WorldModules;
  /** Other users connected now. */
  othersOnline(): number;
  loadCatalog(retry?: boolean): Promise<LoadedCatalog>;
  savedPlan(): SavedPlan | null;
  savePlan(saved: SavedPlan | null): Promise<void>;
  apply(change: ApplyChange): Promise<void>;
  returnToSetup(): Promise<void>;
  /** A whisper to this GM, for whoever runs the server. */
  whisper(text: string): Promise<void>;
  saveFile(text: string): void;
  copy(text: string): Promise<void>;
  /** The family's settings sections, for Soundcheck. */
  settingsSections(): readonly SectionInfo[];
  /** Family modules with settings in Foundry's own settings window. */
  configuredModules(): readonly string[];
  /** Opens where a Soundcheck item is set. */
  openCheck(target: CheckTarget): void;
  onError(error: unknown): void;
}
