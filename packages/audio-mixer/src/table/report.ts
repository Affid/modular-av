import type {
  Contribution,
  EffectDefinition,
  EffectStatus,
  LocalState,
} from "@modular-av/api";
import {
  captureSnapshot,
  parseSnapshot,
  type Snapshot,
} from "../model/snapshot.ts";
import type { LayerState, LayerStatus } from "../layers/layers.ts";
import { audioEffectsOf } from "../model/pipeline.ts";
import { type Warning, WARNING_KEYS, warningsOf } from "../model/warnings.ts";

/** A burst of changes is one report. */
export const COALESCE_MS = 300;

const MAX_EFFECTS = 64;
const MAX_LAYERS = 8;
const MAX_LABEL = 64;
const MAX_ID = 128;

const LAYER_STATES: readonly LayerState[] = [
  "applied",
  "partly",
  "refused",
  "kept-out",
];

const STATUSES: readonly EffectStatus[] = [
  "off",
  "starting",
  "running",
  "failed",
  "unsupported",
  "unavailable",
];

/**
 * What a player tells GMs of their channel. No device names and no audio: the
 * snapshot holds only what a preset does.
 */
export interface Report {
  readonly snapshot: Snapshot;
  readonly status: Readonly<Record<string, EffectStatus>>;
  readonly warnings: readonly Warning[];
  /** A GM's layers, and how each went here. */
  readonly layers: readonly LayerStatus[];
}

export function createReport(
  definitions: readonly EffectDefinition[],
  local: LocalState,
  contributions: readonly Contribution[],
  automationRate: boolean,
  layers: readonly LayerStatus[] = [],
): Report {
  return {
    snapshot: captureSnapshot(definitions, local, contributions),
    status: Object.fromEntries(
      audioEffectsOf(definitions).flatMap(({ id }) => {
        const state = local.effects[id];
        return state ? [[id, state.status]] : [];
      }),
    ),
    warnings: warningsOf(definitions, local, automationRate),
    layers,
  };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseStatus(value: unknown): Report["status"] | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_EFFECTS) return null;
  return entries.every(
    ([id, s]) => id.length <= MAX_ID && STATUSES.includes(s as EffectStatus),
  )
    ? (value as Report["status"])
    : null;
}

function parseWarning(value: unknown): Warning | null {
  if (!isRecord(value)) return null;
  const { key, effect } = value;
  const known = WARNING_KEYS.find((k) => k === key);
  if (!known) return null;
  if (effect === undefined) return { key: known };
  return typeof effect === "string" && effect.length <= MAX_ID
    ? { key: known, effect }
    : null;
}

function parseLayerStatus(value: unknown): LayerStatus | null {
  if (!isRecord(value)) return null;
  const { id, label, state } = value;
  const known = LAYER_STATES.find((s) => s === state);
  return known &&
    typeof id === "string" &&
    id.length <= MAX_ID &&
    typeof label === "string" &&
    label.length <= MAX_LABEL
    ? { id, label, state: known }
    : null;
}

function parseLayers(value: unknown): readonly LayerStatus[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_LAYERS) return null;
  const given = value as readonly unknown[];
  const layers = given.flatMap((l) => parseLayerStatus(l) ?? []);
  return layers.length === given.length ? layers : null;
}

/** What comes over the socket is checked: another client sent it. */
export function parseReport(value: unknown): Report | null {
  if (!isRecord(value)) return null;
  const snapshot = parseSnapshot(value.snapshot);
  const status = parseStatus(value.status);
  if (!snapshot || !status || !Array.isArray(value.warnings)) return null;
  const given = value.warnings as readonly unknown[];
  if (given.length > MAX_EFFECTS) return null;
  const warnings = given.flatMap((w) => parseWarning(w) ?? []);
  const layers = parseLayers(value.layers);
  return warnings.length === given.length && layers
    ? { snapshot, status, warnings, layers }
    : null;
}
