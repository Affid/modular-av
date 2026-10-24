import type { CamerasHost, CamerasPlacement } from "@modular-av/api";
import {
  createFakeApi,
  type FakeApi,
  type FakeApiOptions,
} from "@modular-av/testing";
import en from "../lang/en.json" with { type: "json" };
import {
  createContext,
  type DockContext,
  type FoundrySettingConfig,
} from "../src/context.ts";

interface Tree {
  readonly [key: string]: string | Tree;
}

/** Foundry's localize: the text at the key's path, or the key itself. */
function localize(key: string): string {
  let node: string | Tree | undefined = en;
  for (const part of key.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  return typeof node === "string" ? node : key;
}

export interface TestDock {
  readonly api: FakeApi;
  readonly ctx: DockContext;
  readonly errors: unknown[];
  readonly saved: Map<string, unknown>;
  opened: { settings: number; controls: number };
}

export interface TestDockOptions extends FakeApiOptions {
  readonly isGM?: boolean;
  readonly foundrySettings?: readonly (FoundrySettingConfig & {
    value?: unknown;
  })[];
  readonly pushToTalk?: readonly string[];
}

/** A dock context on the fake API, with the dock's real English texts. */
export function testDock(options: TestDockOptions = {}): TestDock {
  const api = createFakeApi(options);
  const errors: unknown[] = [];
  const saved = new Map<string, unknown>(
    (options.foundrySettings ?? []).map((s) => [
      `${s.namespace}.${s.key}`,
      s.value,
    ]),
  );
  const configs = new Map(
    (options.foundrySettings ?? []).map((s) => [`${s.namespace}.${s.key}`, s]),
  );
  const opened = { settings: 0, controls: 0 };
  const ctx = createContext({
    api,
    game: {
      i18n: {
        localize,
        format: (key, data) =>
          localize(key).replace(
            /\{(\w+)\}/g,
            (_m, name: string) => data[name] ?? "",
          ),
      },
      settings: {
        register: () => undefined,
        get: (namespace, key) => saved.get(`${namespace}.${key}`),
        set: (namespace, key, value) => {
          saved.set(`${namespace}.${key}`, value);
          return Promise.resolve(value);
        },
        settings: configs,
      },
      user: { isGM: options.isGM ?? false },
      userId: "me",
      keybindings: {
        get: () =>
          (options.pushToTalk ?? ["Backquote"]).map((key) => ({ key })),
      },
    },
    openSettings: () => {
      opened.settings += 1;
    },
    openControls: () => {
      opened.controls += 1;
    },
    now: () => 1_000_000,
    onError: (e) => errors.push(e),
  });
  return { api, ctx, errors, saved, opened };
}

export interface FakeHost extends CamerasHost {
  readonly placements: CamerasPlacement[];
}

/** The core's camera dock host, as a surface sees it. */
export function fakeHost(start: CamerasPlacement = "left"): FakeHost {
  const element = document.createElement("aside");
  element.id = "camera-views";
  document.body.append(element);
  let placement = start;
  const placements: CamerasPlacement[] = [];
  return {
    element,
    get placement() {
      return placement;
    },
    setPlacement(next) {
      placement = next;
      placements.push(next);
      return Promise.resolve();
    },
    placements,
  };
}

/** Lets microtasks (state listeners) and pending promises run. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};
