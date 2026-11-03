import type { Channel, ModularAV } from "@modular-av/api";
import type { LayerStatus } from "../layers/layers.ts";
import {
  COALESCE_MS,
  createReport,
  parseReport,
  type Report,
} from "./report.ts";

/** How often an open GM view asks again. */
export const RENEW_MS = 10_000;
/** How long a player reports after the last asking. */
export const STOP_AFTER_MS = 30_000;

export interface TableDeps {
  readonly api: Pick<ModularAV, "state" | "effects" | "contributions">;
  readonly channel: Pick<Channel, "send">;
  isGM(userId: string): boolean;
  readonly selfIsGM: boolean;
  readonly automationRate: boolean;
  /** How a GM's layers went here. */
  layerStates(): readonly LayerStatus[];
  onError(error: unknown): void;
}

export interface Table {
  /** A message on the mixer's socket channel, from Foundry's `senderId`. */
  receive(data: unknown, sender: string): void;
  /** Keeps asking players for reports, until the function it returns. */
  watch(): () => void;
  reportOf(userId: string): Report | undefined;
  subscribe(listener: () => void): () => void;
}

const typeOf = (data: unknown): unknown =>
  typeof data === "object" && data !== null
    ? (data as { type?: unknown }).type
    : undefined;

/** Each player's half answers GMs; a GM's half also reads the answers. */
export function createTable(deps: TableDeps): Table {
  const { api, channel } = deps;
  let watchers: ReadonlyMap<string, number> = new Map();
  let reports: ReadonlyMap<string, Report> = new Map();
  let listeners: readonly (() => void)[] = [];
  let pending: ReturnType<typeof setTimeout> | null = null;
  let stopFollowing: (() => void) | null = null;

  const live = (): readonly string[] => {
    const now = Date.now();
    watchers = new Map([...watchers].filter(([, until]) => until > now));
    return [...watchers.keys()];
  };

  const flush = (): void => {
    pending = null;
    const recipients = live();
    if (recipients.length === 0) {
      stopFollowing?.();
      stopFollowing = null;
      return;
    }
    const report = createReport(
      api.effects.list(),
      api.state.get().local,
      api.contributions.list(),
      deps.automationRate,
      deps.layerStates(),
    );
    channel.send({ type: "report", ...report }, { recipients });
  };

  const schedule = (): void => {
    pending ??= setTimeout(flush, COALESCE_MS);
  };

  const onWatch = (sender: string): void => {
    if (!deps.isGM(sender)) return;
    watchers = new Map(watchers).set(sender, Date.now() + STOP_AFTER_MS);
    stopFollowing ??= api.state.subscribe((s) => s.local, schedule);
    schedule();
    setTimeout(schedule, STOP_AFTER_MS);
  };

  const onReport = (data: unknown, sender: string): void => {
    if (!deps.selfIsGM) return;
    const report = parseReport(data);
    if (!report) return;
    reports = new Map(reports).set(sender, report);
    for (const listener of listeners) listener();
  };

  return {
    receive(data, sender) {
      const type = typeOf(data);
      if (type === "watch") onWatch(sender);
      else if (type === "report") onReport(data, sender);
    },
    watch() {
      const ask = (): void => {
        channel.send({ type: "watch" });
      };
      ask();
      const timer = setInterval(ask, RENEW_MS);
      return () => {
        clearInterval(timer);
      };
    },
    reportOf: (userId) => reports.get(userId),
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
