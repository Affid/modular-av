import type {
  AudioEffectDefinition,
  AudioPlace,
  ControlContribution,
  LocalState,
} from "@modular-av/api";
import { createFakeApi, type FakeApi, localState } from "@modular-av/testing";
import { createWriter } from "../src/model/queue.ts";
import { createPresets, type PresetStore } from "../src/presets/presets.ts";
import { act } from "./act.ts";
import en from "../lang/en.json" with { type: "json" };
import { MODULE_ID } from "../src/constants.ts";
import type { MixerContext } from "../src/window/context.ts";

interface Tree {
  readonly [key: string]: string | Tree;
}

/** Foundry's localize and format: the text at the key's path, or the key. */
export function translate(
  key: string,
  data: Readonly<Record<string, string>> = {},
): string {
  let node: string | Tree | undefined = en;
  for (const part of key.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  if (typeof node !== "string") return key;
  return Object.entries(data).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    node,
  );
}

export function fakeStore(initial: Readonly<Record<string, unknown>> = {}) {
  let saved = initial;
  let active = "";
  let listeners: readonly (() => void)[] = [];
  const changed = (): void => {
    for (const listener of listeners) listener();
  };
  const store: PresetStore = {
    read: () => saved,
    write(id, json) {
      saved = { ...saved, [id]: json };
      changed();
      return Promise.resolve();
    },
    remove(id) {
      saved = Object.fromEntries(
        Object.entries(saved).filter(([key]) => key !== id),
      );
      changed();
      return Promise.resolve();
    },
    activeId: () => active,
    setActiveId(id) {
      active = id;
      changed();
      return Promise.resolve();
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
  return { store, saved: () => saved };
}

export const effect = (
  id: string,
  defaultPlace: AudioPlace,
  extra: Partial<AudioEffectDefinition> = {},
): AudioEffectDefinition =>
  ({
    id,
    kind: "audio",
    label: id.toUpperCase(),
    defaultPlace,
    cost: "light",
    create: () => Promise.reject(new Error("unused")),
    ...extra,
  }) as AudioEffectDefinition;

export interface Setup {
  readonly effects?: readonly AudioEffectDefinition[];
  readonly controls?: readonly ControlContribution[];
  readonly local?: Partial<LocalState>;
  readonly isGM?: boolean;
  readonly presets?: Readonly<Record<string, unknown>>;
}

export interface TestMixer {
  readonly api: FakeApi;
  readonly ctx: MixerContext;
  readonly errors: unknown[];
  readonly store: ReturnType<typeof fakeStore>;
  readonly confirm: { answer: boolean; asked: string[] };
  readonly setLocal: (change: Partial<LocalState>) => Promise<void>;
}

export function testMixer(setup: Setup = {}): TestMixer {
  const effects = setup.effects ?? [];
  const api = createFakeApi();
  for (const d of effects) api.effects.register(d);
  for (const c of setup.controls ?? []) api.contributions.register(c);
  const places = Object.fromEntries(effects.map((d) => [d.id, d.defaultPlace]));
  const merge = (change: Partial<LocalState>) => {
    api.setState((state) => ({
      ...state,
      local: { ...state.local, ...change },
    }));
  };
  merge(localState({ audioEffectPlaces: places, ...setup.local }));
  const errors: unknown[] = [];
  const onError = (error: unknown): void => {
    errors.push(error);
  };
  const store = fakeStore(setup.presets);
  const writes = createWriter(onError);
  const confirm = { answer: true, asked: [] as string[] };
  let ids = 0;
  const presets = createPresets({
    api,
    store: store.store,
    writes,
    newId: () => {
      ids += 1;
      return `id${String(ids)}`;
    },
  });
  const ctx: MixerContext = {
    api,
    isGM: setup.isGM ?? false,
    t: (key, data) => translate(`${MODULE_ID}.${key}`, data),
    text: (label) => translate(label),
    onError,
    automationRate: true,
    recording: {
      record: () => Promise.reject(new Error("unused")),
      play: () => Promise.reject(new Error("unused")),
    },
    presets,
    writes,
    confirm(text) {
      confirm.asked.push(text);
      return Promise.resolve(confirm.answer);
    },
  };
  return {
    api,
    ctx,
    errors,
    store,
    confirm,
    setLocal: (change) => {
      merge(change);
      return act();
    },
  };
}
