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
import { type Warning, WARNING_KEYS, warningsOf } from "../model/warnings.ts";

/** A burst of changes is one report. */
export const COALESCE_MS = 300;

const MAX_EFFECTS = 64;

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
}

export function createReport(
  definitions: readonly EffectDefinition[],
  local: LocalState,
  contributions: readonly Contribution[],
  automationRate: boolean,
): Report {
  return {
    snapshot: captureSnapshot(definitions, local, contributions),
    status: Object.fromEntries(
      Object.entries(local.effects).map(([id, { status }]) => [id, status]),
    ),
    warnings: warningsOf(definitions, local, automationRate),
  };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseStatus(value: unknown): Report["status"] | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_EFFECTS) return null;
  return entries.every(([, s]) => STATUSES.includes(s as EffectStatus))
    ? (value as Report["status"])
    : null;
}

function parseWarning(value: unknown): Warning | null {
  if (!isRecord(value)) return null;
  const { key, effect } = value;
  const known = WARNING_KEYS.find((k) => k === key);
  if (!known) return null;
  if (effect === undefined) return { key: known };
  return typeof effect === "string" ? { key: known, effect } : null;
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
  return warnings.length === given.length
    ? { snapshot, status, warnings }
    : null;
}
