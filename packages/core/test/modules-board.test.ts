// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { Catalog } from "../src/catalog/catalog.ts";
import { type MountedBoard, mountBoard } from "../src/modules/board/board.ts";
import type { ApplyChange, BoardHost, SavedPlan } from "../src/modules/host.ts";
import en from "../lang/en.json" with { type: "json" };

const strings: unknown = en;

function localize(key: string, data: Readonly<Record<string, string>> = {}) {
  const found = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      strings,
    );
  return typeof found === "string"
    ? found.replace(/\{(\w+)\}/g, (_m, name: string) => data[name] ?? "")
    : key;
}

const url = (id: string) =>
  `https://raw.githubusercontent.com/Affid/modular-av/manifests/${id}/module.json`;
const mod = (id: string, kind: string, requires = ["modular-av"]) => ({
  id,
  title: `Modular A/V — ${id}`,
  description: `${id} does things.`,
  kind: kind as "service",
  version: "0.4.0",
  manifest: url(id),
  requires: requires.map((r) => ({ id: r, minimum: "0.4.0" })),
});
const catalog: Catalog = {
  schema: 1,
  modules: [
    mod("modular-av", "core", []),
    mod("modular-av-livekit", "service"),
    mod("modular-av-p2p", "service"),
    mod("modular-av-dock", "ui"),
    mod("modular-av-mic-denoise", "effect"),
    mod("modular-av-dock-vines", "theme", ["modular-av-dock"]),
  ],
  soon: [
    {
      id: "modular-av-livekit-krisp",
      title: "Modular A/V — Krisp",
      description: "Krisp.",
      kind: "effect",
      requires: [],
    },
  ],
};

type World = Record<string, { active: boolean; version?: string }>;

const RUNNING: World = {
  "modular-av": { active: true },
  "modular-av-livekit": { active: true },
  "modular-av-dock": { active: true },
};

let mounted: MountedBoard | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
  document.body.replaceChildren();
});

async function open(
  world: World = RUNNING,
  saved: SavedPlan | null = null,
  applyFails = false,
) {
  const calls = {
    saved: [] as (SavedPlan | null)[],
    applied: [] as ApplyChange[],
    left: 0,
    copied: [] as string[],
    whispered: [] as string[],
    errors: [] as unknown[],
  };
  const host: BoardHost = {
    doc: document,
    t: localize,
    world: () =>
      new Map(
        Object.entries(world).map(([id, w]) => [
          id,
          { active: w.active, version: w.version ?? "0.4.0" },
        ]),
      ),
    othersOnline: () => 3,
    loadCatalog: () =>
      Promise.resolve({
        catalog,
        source: "bundled",
        known: new Set(catalog.modules.map((m) => m.id)),
      }),
    savedPlan: () => saved,
    savePlan: (plan) => {
      calls.saved.push(plan);
      return Promise.resolve();
    },
    apply: (change) => {
      calls.applied.push(change);
      return applyFails
        ? Promise.reject(new Error("permission"))
        : Promise.resolve();
    },
    returnToSetup: () => {
      calls.left += 1;
      return Promise.resolve();
    },
    whisper: (text) => {
      calls.whispered.push(text);
      return Promise.resolve();
    },
    saveFile: () => undefined,
    copy: (text) => {
      calls.copied.push(text);
      return Promise.resolve();
    },
    settingsSections: () => [],
    configuredModules: () => [],
    openCheck: () => undefined,
    onError: (error) => {
      calls.errors.push(error);
    },
  };
  const content = document.createElement("div");
  document.body.append(content);
  mounted = await mountBoard(host, content);
  const q = (selector: string) =>
    content.querySelector<HTMLButtonElement | HTMLInputElement>(selector);
  const click = (key: string) => {
    const target = q(`[data-key="${key}"]`);
    if (!target) throw new Error(`no ${key}`);
    target.click();
  };
  const text = (selector: string) => q(selector)?.textContent ?? "";
  const settle = () => new Promise((done) => setTimeout(done, 0));
  return { content, calls, q, click, text, settle };
}

const onBoard = (content: HTMLElement) =>
  [...content.querySelectorAll(".mav-board-plan .mav-board-piece .name")].map(
    (n) => n.textContent,
  );

describe("the assembly board", () => {
  it("shows what the world runs, the rest in the tray", async () => {
    const { content, text } = await open();

    expect(onBoard(content)).toEqual(["LiveKit", "Dock"]);
    expect(text(".mav-board-status")).toContain(
      "This world runs LiveKit and Dock.",
    );
    expect(text(".mav-board-tray")).toContain("Peer to peer");
    expect(text(".mav-board-tray")).toContain("Coming soon: Krisp");
  });

  it("swaps the service with a piece's button, saying so, and undoes it", async () => {
    const { content, calls, click, text } = await open();

    click("add-modular-av-p2p");

    expect(onBoard(content)).toEqual(["Peer to peer", "Dock"]);
    expect(text(".mav-board-toast")).toContain(
      "Peer to peer on the board; LiveKit back in the tray.",
    );
    expect(text(".mav-board-status")).toContain(
      "Your plan: 1 to install, 1 to turn off.",
    );
    expect(document.activeElement?.getAttribute("data-key")).toBe(
      "remove-modular-av-p2p",
    );
    expect(calls.saved.at(-1)?.plan).toEqual([
      "modular-av-dock",
      "modular-av-p2p",
    ]);

    content.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    );

    expect(onBoard(content)).toEqual(["LiveKit", "Dock"]);
    expect(calls.saved.at(-1)).toBeNull();
  });

  it("takes a theme only with what it themes, and removes it with it", async () => {
    const { content, click, q } = await open({
      ...RUNNING,
      "modular-av-dock": { active: false },
      "modular-av-livekit": { active: true },
    });
    expect(q('[data-key="add-modular-av-dock-vines"]')).toMatchObject({
      disabled: true,
      textContent: "Needs Dock on the board",
    });

    click("add-modular-av-dock");
    click("add-modular-av-dock-vines");
    expect(onBoard(content)).toEqual(["LiveKit", "Dock", "Vines theme"]);

    click("remove-modular-av-dock");

    expect(onBoard(content)).toEqual(["LiveKit"]);
  });

  it("helps choose a service", async () => {
    const { content, click, q } = await open();
    click("helper-open");

    q('[data-key="helper-browsers"]')?.click();
    q('[data-key="helper-browsers"]')?.dispatchEvent(new Event("change"));
    expect(q('[data-key="helper-go"]')?.textContent).toBe(
      "Use Peer to peer instead of LiveKit",
    );
    click("helper-go");

    expect(onBoard(content)).toContain("Peer to peer");
  });
});

describe("the board's steps", () => {
  it("gives the links to install, and leaves for Setup with them saved", async () => {
    const { calls, click, text, settle } = await open();
    click("add-modular-av-p2p");

    expect(text(".mav-board-steps")).toContain(url("modular-av-p2p"));
    click("copy-all");
    await settle();
    expect(calls.copied[0]).toContain(`Peer to peer: ${url("modular-av-p2p")}`);

    click("go-setup");
    expect(text(".mav-board-confirm")).toContain("3 players are connected");
    click("leave-ok");
    await settle();

    expect(calls.saved.at(-1)).toEqual({
      plan: ["modular-av-dock", "modular-av-p2p"],
      trip: ["modular-av-p2p"],
    });
    expect(calls.left).toBe(1);
  });

  it("keeps the running service until its replacement is installed", async () => {
    const { click, text, q } = await open();
    click("add-modular-av-p2p");

    expect(text(".mav-board-steps")).toContain(
      "LiveKit stays on until Peer to peer is installed",
    );
    expect(q('[data-key="apply"]')?.disabled).toBe(true);
  });

  it("welcomes the GM back and applies what was installed", async () => {
    const { calls, click, text, settle } = await open(
      { ...RUNNING, "modular-av-p2p": { active: false } },
      { plan: ["modular-av-p2p", "modular-av-dock"], trip: ["modular-av-p2p"] },
    );
    expect(text(".mav-board-status")).toContain(
      "Welcome back: Peer to peer installed. Apply below.",
    );

    click("apply");
    expect(text(".mav-board-confirm")).toContain("3 players are connected");
    click("apply-ok");
    await settle();

    expect(calls.applied).toEqual([
      { on: ["modular-av-p2p"], off: ["modular-av-livekit"], ui: null },
    ]);
    expect(calls.saved.at(-1)).toBeNull();
  });

  it("names updates, done on Setup", async () => {
    const { text } = await open({
      ...RUNNING,
      "modular-av-dock": { active: true, version: "0.3.1" },
    });

    expect(text(".mav-board-notice")).toContain("Updates available: Dock");
    expect(text(".mav-board-steps")).toContain(
      "Update Dock: Add-on Modules, Update All.",
    );
  });

  it("keeps the only service on when the plan has none", async () => {
    const { click, text, q } = await open();

    click("remove-modular-av-livekit");

    expect(text(".mav-board-steps")).toContain(
      "LiveKit stays on: without a service, nobody can join a call.",
    );
    expect(q('[data-key="apply"]')?.disabled).toBe(true);
  });

  it("never plans to turn off a running module the catalog doesn't know", async () => {
    const { text } = await open(
      { ...RUNNING, "modular-av-tokens": { active: true } },
      { plan: ["modular-av-livekit", "modular-av-dock"], trip: null },
    );

    expect(text(".mav-board-status")).toContain("This world runs");
  });

  it("keeps the plan when Apply fails, and applies once however often clicked", async () => {
    const { calls, click, settle } = await open(
      { ...RUNNING, "modular-av-mic-denoise": { active: false } },
      null,
      true,
    );
    click("add-modular-av-mic-denoise");
    click("apply");

    click("apply-ok");
    click("apply-ok");
    await settle();

    expect(calls.applied).toHaveLength(1);
    expect(calls.errors).toHaveLength(1);
    expect(calls.saved.at(-1)?.plan).toContain("modular-av-mic-denoise");

    // Once it has failed, Apply can be tried again.
    click("apply-ok");
    await settle();
    expect(calls.applied).toHaveLength(2);
  });

  it("keeps its announcements in one place across redraws", async () => {
    const { content, click } = await open();
    const toast = content.querySelector(".mav-board-toast");

    click("add-modular-av-p2p");
    click("undo");

    expect(content.querySelector(".mav-board-toast")).toBe(toast);
    expect(toast?.textContent).toContain("Undone.");
  });

  it("changes nothing once closed, whatever answers late", async () => {
    const { content, click, text, settle } = await open();
    click("add-modular-av-p2p");
    const before = text(".mav-board-steps");

    click("chat");
    mounted?.dispose();
    await settle();

    expect(text(".mav-board-steps")).toBe(before);
    expect(
      content.querySelector(".mav-board-toast")?.textContent,
    ).not.toContain("Whispered");
  });
});
