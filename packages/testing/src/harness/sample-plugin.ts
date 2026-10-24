// A sample plugin for the UI contract (?sample=1): one contribution of
// each kind, whose commands are recorded, so the suite checks that a UI
// renders them all and runs them.
import type {
  Contribution,
  ModularAV,
  Observable,
  ParticipantId,
} from "@modular-av/api";

export interface SampleControls {
  /** Every command run, e.g. "toggle:true", "action:p1". */
  readonly calls: readonly string[];
  /** Shows the sample indicator on these participants. */
  setIndicated(participants: readonly ParticipantId[]): void;
}

/** A value with listeners, standing in for a plugin's own state. */
function cell<T>(initial: T): Observable<T> & { set(value: T): void } {
  let value = initial;
  let listeners: readonly ((v: T) => void)[] = [];
  return {
    get: () => value,
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener(next);
    },
  };
}

export const SAMPLE = {
  toggle: "sample.toggle",
  strength: "sample.strength",
  choice: "sample.choice",
  button: "sample.button",
  action: "sample.action",
  indicator: "sample.indicator",
  row: "sample.row",
  section: "sample.section",
  setting: "sample-plugin.level",
} as const;

function contributions(
  record: (call: string) => void,
  indicated: Observable<ReadonlySet<ParticipantId>>,
): readonly Contribution[] {
  const on = cell({ on: false });
  const strength = cell(50);
  const model = cell("a");
  const done = (call: string) => () => {
    record(call);
    return Promise.resolve();
  };
  return [
    {
      kind: "control",
      place: "quick",
      type: "toggle",
      id: SAMPLE.toggle,
      label: "Sample toggle",
      icon: "fa-solid fa-droplet",
      state: on,
      set(value) {
        on.set({ on: value });
        return done(`toggle:${String(value)}`)();
      },
      controls: [
        {
          type: "range",
          id: SAMPLE.strength,
          label: "Sample strength",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
          state: strength,
          set(value) {
            strength.set(value);
            return done(`strength:${String(value)}`)();
          },
        },
      ],
    },
    {
      kind: "control",
      place: "quick",
      type: "choice",
      id: SAMPLE.choice,
      label: "Sample choice",
      options: [
        { value: "a", label: "Sample A" },
        { value: "b", label: "Sample B" },
      ],
      state: model,
      set(value) {
        model.set(value);
        return done(`choice:${value}`)();
      },
    },
    {
      kind: "control",
      place: "quick",
      type: "button",
      id: SAMPLE.button,
      label: "Sample button",
      run: done("button"),
    },
    {
      kind: "participant-action",
      id: SAMPLE.action,
      label: "Sample action",
      run: (participant) => done(`action:${participant}`)(),
    },
    {
      kind: "indicator",
      id: SAMPLE.indicator,
      label: "Sample on",
      icon: "fa-solid fa-star",
      active: indicated,
    },
    {
      kind: "status-row",
      id: SAMPLE.row,
      label: "Sample region",
      value: cell<string | null>("Sample region value"),
    },
    {
      kind: "settings-section",
      id: SAMPLE.section,
      label: "Sample settings",
      settings: [SAMPLE.setting],
    },
  ];
}

/** Registers the sample plugin's setting and contributions on a client. */
export function installSamplePlugin(
  hooks: {
    on(name: string, fn: (api: ModularAV) => void): unknown;
    once(name: string, fn: () => void): unknown;
  },
  settings: {
    register(namespace: string, key: string, config: object): void;
  },
): SampleControls {
  let calls: readonly string[] = [];
  const indicated = cell<ReadonlySet<ParticipantId>>(new Set());
  hooks.once("init", () => {
    settings.register("sample-plugin", "level", {
      name: "Sample level",
      scope: "client",
      config: false,
      type: Number,
      default: 3,
    });
  });
  hooks.on("modularAV.register", (api) => {
    for (const c of contributions(
      (call) => (calls = [...calls, call]),
      indicated,
    ))
      api.contributions.register(c);
  });
  return {
    get calls() {
      return calls;
    },
    setIndicated(participants) {
      indicated.set(new Set(participants));
    },
  };
}
