import type { ModularAV } from "@modular-av/api";
import type { GmLayers } from "../layers/gm-layers.ts";
import type { Layers } from "../layers/layers.ts";
import type { Writer } from "../model/queue.ts";
import type { Presets } from "../presets/presets.ts";
import type { Table } from "../table/table.ts";
import type { Recording } from "./voice-test.ts";

/** What the window draws from, and all it can change. */
export interface MixerContext {
  readonly api: Pick<
    ModularAV,
    "state" | "commands" | "effects" | "contributions" | "preview" | "meters"
  >;
  readonly isGM: boolean;
  /** This module's text, by a key under its own name. */
  t(key: string, data?: Readonly<Record<string, string>>): string;
  /** A contributed label: an i18n key or plain text. */
  text(label: string): string;
  onError(error: unknown): void;
  /** Whether the browser can schedule a gain with no click (not Firefox). */
  readonly automationRate: boolean;
  readonly recording: Recording;
  readonly presets: Presets;
  /** The module's one queue: presets and the window write through it. */
  readonly writes: Writer;
  /** Asks before something can't be undone. */
  confirm(text: string): Promise<boolean>;
  /** A GM's: what the others run. */
  readonly table?: Table;
  /** A GM's layers over this client's channel. */
  readonly layers?: Layers;
  /** A GM's: laying a change over the table or a player. */
  readonly gmLayers?: GmLayers;
}

/** Something drawn, with what undoes its subscriptions. */
export interface Rendered {
  readonly element: HTMLElement;
  dispose(): void;
}

export type MixerTab = "mine" | "table";

/** The window's content. */
export interface MixerView extends Rendered {
  /** Brings up a tab, where there are tabs. */
  readonly show?: (tab: MixerTab) => void;
}
