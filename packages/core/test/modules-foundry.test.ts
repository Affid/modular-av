// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  type BoardFoundry,
  createFoundryBoardHost,
  readSavedPlan,
} from "../src/modules/foundry-host.ts";
import { registerModulesMenu } from "../src/modules/menu.ts";

function foundry(settings = new Map<string, unknown>()) {
  const calls = {
    emitted: [] as string[],
    reloads: 0,
    chats: [] as object[],
    files: [] as string[],
    shutDown: 0,
  };
  const module = (id: string, version: string, active: boolean) =>
    [id, { id, version, active }] as const;
  const game = {
    userId: "gm",
    modules: new Map([
      module("modular-av", "0.4.0", true),
      module("modular-av-dock", "0.4.0", true),
      module("modular-av-p2p", "0.3.0", false),
      module("lib-wrapper", "1.0.0", true),
    ]),
    users: {
      contents: [
        { id: "gm", active: true },
        { id: "p1", active: true },
        { id: "p2", active: false },
      ],
    },
    settings: {
      get: (ns: string, key: string) => settings.get(`${ns}.${key}`),
      set: (ns: string, key: string, value: unknown) => {
        settings.set(`${ns}.${key}`, value);
        return Promise.resolve(value);
      },
    },
    socket: {
      emit: (event: string) => {
        calls.emitted.push(event);
      },
    },
    i18n: {
      localize: (key: string) => key,
      format: (key: string, data: Record<string, string>) =>
        `${key} ${JSON.stringify(data)}`,
    },
    shutDown: () => {
      calls.shutDown += 1;
      return Promise.resolve();
    },
  };
  const deps = {
    game: game as unknown as BoardFoundry["game"],
    doc: document,
    chat: {
      create: (data: object) => {
        calls.chats.push(data);
        return Promise.resolve();
      },
    },
    utils: {
      getRoute: (path: string) => `/${path}`,
      saveDataToFile: (data: string) => {
        calls.files.push(data);
      },
      debouncedReload: () => {
        calls.reloads += 1;
      },
    },
    clipboard: undefined,
    fetch: () =>
      Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    onError: () => undefined,
  } satisfies BoardFoundry;
  return { host: createFoundryBoardHost(deps), calls, settings };
}

describe("the board in Foundry", () => {
  it("sees the family's modules and the other players online", () => {
    const { host } = foundry();

    expect([...host.world()]).toEqual([
      ["modular-av", { active: true, version: "0.4.0" }],
      ["modular-av-dock", { active: true, version: "0.4.0" }],
      ["modular-av-p2p", { active: false, version: "0.3.0" }],
    ]);
    expect(host.othersOnline()).toBe(1);
  });

  it("applies as Foundry's module manager does, then reloads everyone", async () => {
    const { host, calls, settings } = foundry(
      new Map([["core.moduleConfiguration", { "lib-wrapper": true }]]),
    );

    await host.apply({
      on: ["modular-av-dock"],
      off: ["modular-av-livekit"],
      ui: "modular-av-dock",
    });

    expect(settings.get("core.moduleConfiguration")).toEqual({
      "lib-wrapper": true,
      "modular-av-dock": true,
      "modular-av-livekit": false,
    });
    expect(settings.get("modular-av.cameras")).toBe("modular-av-dock.cameras");
    expect(settings.get("modular-av.settingsWindow")).toBe(
      "modular-av-dock.settings",
    );
    expect(calls.emitted).toEqual(["reload"]);
    expect(calls.reloads).toBe(1);
  });

  it("whispers the links as text, never as markup", async () => {
    const { host, calls } = foundry();

    await host.whisper("<img src=x onerror=alert(1)> https://x/module.json");

    expect(calls.chats).toEqual([
      {
        content:
          "<pre>&lt;img src=x onerror=alert(1)&gt; https://x/module.json</pre>",
        whisper: ["gm"],
      },
    ]);
  });

  it("says copying failed where the page has no clipboard", async () => {
    const { host } = foundry();

    await expect(host.copy("x")).rejects.toThrow(/clipboard/);
  });

  it("fails to load when the shipped catalog can't be read", async () => {
    const { host } = foundry();

    await expect(host.loadCatalog()).rejects.toThrow(/unreadable/);
  });

  it("keeps the plan in the world, and reads back only a well-formed one", async () => {
    const { host } = foundry();

    await host.savePlan({ plan: ["modular-av-dock"], trip: null });

    expect(host.savedPlan()).toEqual({ plan: ["modular-av-dock"], trip: null });
    expect(readSavedPlan({ plan: [1] })).toBeNull();
    expect(readSavedPlan("plan")).toBeNull();
    expect(readSavedPlan({ plan: ["a"], trip: "b" })).toEqual({
      plan: ["a"],
      trip: null,
    });
  });
});

describe("the modules menu", () => {
  it("is a GM's menu whose type only opens the board", async () => {
    const menus = new Map<string, { type: new () => { render(): unknown } }>();
    const registered: string[] = [];
    let opened = 0;
    class Application {
      readonly kind = "application";
    }
    registerModulesMenu({
      game: {
        settings: {
          register: (ns: string, key: string) =>
            registered.push(`${ns}.${key}`),
          registerMenu: (
            ns: string,
            key: string,
            menu: {
              type: new () => { render(): unknown };
              restricted: boolean;
            },
          ) => {
            expect(menu.restricted).toBe(true);
            menus.set(`${ns}.${key}`, menu);
          },
        },
      } as never,
      base: Application,
      open: () => {
        opened += 1;
      },
    });

    const Menu = menus.get("modular-av.modules")?.type;
    if (!Menu) throw new Error("no menu");
    const menu = new Menu();
    await menu.render();

    expect(menu).toBeInstanceOf(Application);
    expect(opened).toBe(1);
    expect(registered).toEqual(["modular-av.modulesPlan"]);
  });
});
