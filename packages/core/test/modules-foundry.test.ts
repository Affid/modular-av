// @vitest-environment happy-dom
import type { Contribution } from "@modular-av/api";
import { describe, expect, it } from "vitest";
import {
  type BoardFoundry,
  createFoundryBoardHost,
  readSavedPlan,
} from "../src/modules/foundry-host.ts";
import { registerModulesMenu } from "../src/modules/menu.ts";
import { checkForNews } from "../src/modules/news.ts";

const catalogOf = (version: string) =>
  JSON.stringify({
    schema: 1,
    modules: [
      {
        id: "modular-av-dock",
        title: "Modular A/V — Dock",
        description: "Cameras.",
        kind: "ui",
        version,
        manifest:
          "https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-dock/module.json",
        requires: [],
      },
    ],
  });

function foundry(
  settings = new Map<string, unknown>(),
  served: Readonly<Record<string, string>> = {},
) {
  const calls = {
    emitted: [] as string[],
    reloads: 0,
    chats: [] as object[],
    files: [] as string[],
    shutDown: 0,
    opened: [] as unknown[],
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
    fetch: (url: string) =>
      Promise.resolve({
        ok: url in served,
        text: () => Promise.resolve(served[url] ?? ""),
      }),
    onError: () => undefined,
    settingsWindow: {
      render: (options?: object) => {
        calls.opened.push(options);
      },
    },
    openFoundrySettings: (category: string) => {
      calls.opened.push({ foundry: category });
    },
    contributions: (): readonly Contribution[] => [
      {
        kind: "settings-section",
        id: "modular-av-mic-denoise.section",
        label: "Noise cancellation",
        settings: ["modular-av-mic-denoise.quality"],
        tab: "voice",
      },
      {
        kind: "settings-section",
        id: "other.controls-only",
        label: "Only controls",
        settings: [],
      },
      {
        kind: "status-row",
        id: "modular-av-livekit.region",
        label: "Region",
        value: { get: () => null, subscribe: () => () => undefined },
      },
    ],
    configured: () => [
      { namespace: "modular-av-livekit", config: true },
      { namespace: "modular-av-livekit", config: false },
      { namespace: "modular-av-jitsi", config: false },
      { namespace: "lib-wrapper", config: true },
    ],
  } satisfies BoardFoundry;
  return { host: createFoundryBoardHost(deps), deps, calls, settings };
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

  it("shows GitHub's catalog, unless the world turned asking it off", async () => {
    const files = {
      "/modules/modular-av/catalog.json": catalogOf("0.4.0"),
      "https://raw.githubusercontent.com/Affid/modular-av/manifests/catalog.json":
        catalogOf("0.5.0"),
    };
    const on = foundry(new Map(), files);
    const off = foundry(new Map([["modular-av.checkGitHub", false]]), files);

    const fetched = await on.host.loadCatalog();
    const own = await off.host.loadCatalog();

    expect([fetched.source, fetched.catalog.modules[0]?.version]).toEqual([
      "github",
      "0.5.0",
    ]);
    expect([own.source, own.catalog.modules[0]?.version]).toEqual([
      "off",
      "0.4.0",
    ]);
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

describe("Soundcheck in Foundry", () => {
  it("lists the family's settings sections and its settings in Foundry's own window", () => {
    const { host } = foundry();

    expect(host.settingsSections()).toEqual([
      {
        id: "modular-av-mic-denoise.section",
        moduleId: "modular-av-mic-denoise",
        label: "Noise cancellation",
        tab: "voice",
      },
    ]);
    expect(host.configuredModules()).toEqual(["modular-av-livekit"]);
  });

  it("opens the settings window on a tab, or Foundry's own on a module", () => {
    const { host, calls } = foundry();

    host.openCheck({ tab: "voice" });
    host.openCheck({ foundry: "modular-av-livekit" });

    expect(calls.opened).toEqual([
      { force: true, modularAV: { tab: "voice" } },
      { foundry: "modular-av-livekit" },
    ]);
  });
});

describe("the daily news", () => {
  it("tells a GM of an update once, until there is another", async () => {
    const files = {
      "/modules/modular-av/catalog.json": catalogOf("0.4.0"),
      "https://raw.githubusercontent.com/Affid/modular-av/manifests/catalog.json":
        catalogOf("0.5.0"),
    };
    const { deps, settings } = foundry(new Map(), files);
    const told: string[] = [];

    await checkForNews(deps, (m) => told.push(m), 1000);
    await checkForNews(deps, (m) => told.push(m), 2000);

    expect(told).toEqual([
      'modular-av.modules.news.message {"news":"modular-av.modules.news.updates {\\"names\\":\\"Dock\\"}"}',
    ]);
    expect(settings.get("modular-av.lastGitHubCheck")).toBe(2000);
  });

  it("tells of a new module's title as text, never as markup", async () => {
    const hostile = JSON.parse(catalogOf("0.4.0")) as {
      modules: Record<string, unknown>[];
    };
    hostile.modules.push({
      ...hostile.modules[0],
      id: "modular-av-evil",
      title: '<img src="https://evil.example/x.png">',
      manifest:
        "https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-evil/module.json",
    });
    const { deps } = foundry(new Map(), {
      "/modules/modular-av/catalog.json": catalogOf("0.4.0"),
      "https://raw.githubusercontent.com/Affid/modular-av/manifests/catalog.json":
        JSON.stringify(hostile),
    });
    const told: string[] = [];

    await checkForNews(deps, (m) => told.push(m), 1000);

    expect(told[0]).toContain("&lt;img");
    expect(told[0]).not.toContain("<img");
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
    expect(registered).toEqual([
      "modular-av.modulesPlan",
      "modular-av.checkGitHub",
      "modular-av.noServiceDismissed",
      "modular-av.lastGitHubCheck",
      "modular-av.lastModuleNews",
    ]);
  });
});
