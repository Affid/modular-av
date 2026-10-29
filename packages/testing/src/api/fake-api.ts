/**
 * A stand-in for the core's public API, for testing UI modules without the
 * core: a state the test sets (listeners run in a microtask, as the core's
 * do), commands that are recorded and may be made to fail, attachments,
 * meters the test feeds, a Picture-in-Picture window and stats.
 */
import { createFakePreviews, type FakePreviews } from "./fake-previews.ts";
import type {
  AVCommands,
  AVState,
  Contribution,
  ConnectionStats,
  MeterReading,
  ModularAV,
  ParticipantId,
  PipWindow,
  Registry,
  Store,
  SurfaceDefinition,
  VideoSource,
} from "@modular-av/api";
import { avState } from "../state/fixtures.ts";

export interface CommandCall {
  readonly command: keyof AVCommands;
  readonly args: readonly unknown[];
}

export interface Attachment {
  readonly participant: ParticipantId;
  readonly source: VideoSource;
  readonly element: HTMLVideoElement;
  readonly detached: boolean;
}

export interface MeterSubscription {
  readonly participant: ParticipantId;
  readonly element: Element;
  readonly active: boolean;
}

export interface FakeApi extends ModularAV {
  /** Previews asked for, with ways to feed and refuse them. */
  readonly preview: FakePreviews;
  /** Changes the state; listeners run in a microtask. */
  setState(change: (state: AVState) => AVState): void;
  readonly calls: readonly CommandCall[];
  /** The next call of `command` rejects with this error. */
  failNext(command: keyof AVCommands, error: Error): void;
  readonly attachments: readonly Attachment[];
  readonly meterSubscriptions: readonly MeterSubscription[];
  /** Feeds every active meter of `participant`. */
  emitLevel(participant: ParticipantId, reading: MeterReading): void;
  /** What `stats.get` answers, by participant ("" for this client). */
  setStats(participant: ParticipantId | null, stats: ConnectionStats): void;
  /** Registers like the core's register hook, then closes. */
  registered(): {
    readonly surfaces: readonly SurfaceDefinition[];
    readonly contributions: readonly Contribution[];
  };
}

function fakeStore(initial: AVState): {
  readonly store: Store<AVState>;
  readonly set: (change: (state: AVState) => AVState) => void;
} {
  let state = initial;
  let subs: readonly {
    select: (s: AVState) => unknown;
    listener: (value: unknown, previous: unknown) => void;
    equals: (a: unknown, b: unknown) => boolean;
    last: { value: unknown };
  }[] = [];
  let scheduled = false;
  const notify = (): void => {
    scheduled = false;
    for (const sub of subs) {
      const value = sub.select(state);
      if (sub.equals(value, sub.last.value)) continue;
      const previous = sub.last.value;
      sub.last.value = value;
      sub.listener(value, previous);
    }
  };
  const store: Store<AVState> = {
    get: () => state,
    subscribe(select, listener, options) {
      const sub = {
        select,
        listener: listener as (value: unknown, previous: unknown) => void,
        equals: (options?.equals ?? Object.is) as (
          a: unknown,
          b: unknown,
        ) => boolean,
        last: { value: select(state) as unknown },
      };
      subs = [...subs, sub];
      return () => {
        subs = subs.filter((s) => s !== sub);
      };
    },
  };
  return {
    store,
    set: (change) => {
      state = change(state);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(notify);
    },
  };
}

function openRegistry<T extends { readonly id: string }>(): Registry<T> {
  let items: readonly T[] = [];
  return {
    register(definition) {
      items = [...items, definition];
    },
    list: () => items,
    get: (id) => items.find((d) => d.id === id),
    onChange: () => () => undefined,
  };
}

const COMMANDS: readonly (keyof AVCommands)[] = [
  "setMuted",
  "setVideoEnabled",
  "setDeafened",
  "setVolume",
  "setHiddenByMe",
  "setReceiveVideo",
  "setVoiceMode",
  "leave",
  "rejoin",
  "reconnectNow",
  "setEffectEnabled",
  "setInputSensitivity",
  "setGateFallback",
  "setDevice",
  "setBroadcastPermissions",
];

export interface FakeApiOptions {
  readonly state?: AVState;
  /** Whether the browser has Document Picture-in-Picture. */
  readonly pip?: boolean;
}

export function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const { store, set } = fakeStore(options.state ?? avState());
  let calls: readonly CommandCall[] = [];
  let failures = new Map<keyof AVCommands, Error>();
  let attachments: Attachment[] = [];
  let meters: {
    sub: MeterSubscription;
    listener: (r: MeterReading) => void;
  }[] = [];
  let stats = new Map<string, ConnectionStats>();
  let pip: PipWindow | null = null;
  const surfaces = openRegistry<SurfaceDefinition>();
  const contributions = openRegistry<Contribution>();
  const preview = createFakePreviews();

  const command =
    (name: keyof AVCommands) =>
    (...args: unknown[]): Promise<void> => {
      calls = [...calls, { command: name, args }];
      const failure = failures.get(name);
      if (!failure) return Promise.resolve();
      failures = new Map(failures);
      failures.delete(name);
      return Promise.reject(failure);
    };
  const commands = Object.fromEntries(
    COMMANDS.map((name) => [name, command(name)]),
  ) as unknown as AVCommands;

  return {
    version: "0.0.0-fake",
    state: store,
    commands,
    preview,
    media: {
      attach(participant, source, element) {
        const attachment = { participant, source, element, detached: false };
        attachments = [...attachments, attachment];
        return () => {
          attachments = attachments.map((a) =>
            a === attachment ? { ...a, detached: true } : a,
          );
        };
      },
    },
    meters: {
      subscribe(participant, element, listener) {
        const entry = {
          sub: { participant, element, active: true },
          listener,
        };
        meters = [...meters, entry];
        return () => {
          meters = meters.map((m) =>
            m === entry ? { ...m, sub: { ...m.sub, active: false } } : m,
          );
        };
      },
    },
    windows: {
      pip: {
        supported: () => options.pip ?? false,
        get current() {
          return pip;
        },
        request(owner) {
          if (!(options.pip ?? false))
            return Promise.reject(
              Object.assign(new Error("unsupported"), {
                code: "unsupported",
                params: {},
              }),
            );
          const doc = document.implementation.createHTMLDocument("");
          let listeners: (() => void)[] = [];
          const opened: PipWindow = {
            owner,
            window: { document: doc } as unknown as Window,
            document: doc,
            close() {
              pip = null;
              for (const l of listeners) l();
              listeners = [];
            },
            onClose(listener) {
              listeners = [...listeners, listener];
              return () => {
                listeners = listeners.filter((l) => l !== listener);
              };
            },
          };
          pip = opened;
          return Promise.resolve(opened);
        },
        onChange: () => () => undefined,
      },
    },
    stats: {
      get(participant) {
        const found = stats.get(participant ?? "");
        return found
          ? Promise.resolve(found)
          : // As the core: nothing measured (yet) is a "not-ready" command error.
            Promise.reject(
              Object.assign(new Error("no stats"), { code: "not-ready" }),
            );
      },
    },
    services: openRegistry(),
    effects: openRegistry(),
    surfaces,
    contributions,
    socket: () => ({ send: () => undefined, on: () => () => undefined }),
    assetUrl: (moduleId, path) => `/modules/${moduleId}/${path}`,
    setState: set,
    get calls() {
      return calls;
    },
    failNext(name, error) {
      failures = new Map(failures).set(name, error);
    },
    get attachments() {
      return attachments;
    },
    get meterSubscriptions() {
      return meters.map((m) => m.sub);
    },
    emitLevel(participant, reading) {
      for (const m of meters)
        if (m.sub.active && m.sub.participant === participant)
          m.listener(reading);
    },
    setStats(participant, value) {
      stats = new Map(stats).set(participant ?? "", value);
    },
    registered: () => ({
      surfaces: surfaces.list(),
      contributions: contributions.list(),
    }),
  };
}
