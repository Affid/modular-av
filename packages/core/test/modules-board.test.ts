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
    opened: [] as unknown[],
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
    configuredModules: () => ["modular-av-livekit"],
    serviceInUse: () => "modular-av-livekit",
    openCheck: (target) => {
      calls.opened.push(target);
    },
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

/** The names on the Next chain's cards, in signal order. */
const chain = (content: HTMLElement) =>
  [...content.querySelectorAll(".mav-board-next .mav-board-slot .name")].map(
    (n) => n.textContent,
  );

const onAir = (content: HTMLElement) =>
  [...content.querySelectorAll(".mav-board-onair .mav-board-chip")].map(
    (n) => n.textContent,
  );

describe("the modules board's chain", () => {
  it("shows what the world runs on air, and the same chain next", async () => {
    const { content, text } = await open();

    expect(onAir(content)).toEqual(["LiveKit", "Dock"]);
    expect(chain(content)).toEqual(["LiveKit", "Dock", "The Dock's own look"]);
    expect(text(".mav-board-status")).toContain("On air as planned.");
  });

  it("plans only the service in use when several run", async () => {
    const { content, text } = await open({
      ...RUNNING,
      "modular-av-p2p": { active: true },
    });

    expect(chain(content)).toEqual(["LiveKit", "Dock", "The Dock's own look"]);
    expect(text(".mav-board-status")).toContain(
      "Your next setup: 1 to turn off.",
    );
    expect(text(".mav-board-leaving")).toBe(
      "Comes off air when you go live: Peer to peer (stays installed).",
    );
  });

  it("opens a stage's choices and swaps the service, saying so, and undoes it", async () => {
    const { content, calls, click, text } = await open();

    click("stage-service");
    expect(document.activeElement?.getAttribute("data-key")).toBe(
      "drawer-title",
    );
    click("tile-modular-av-p2p");
    expect(text(".mav-board-inspect")).toContain("Peer to peer");
    click("inspect-act");

    expect(chain(content)).toEqual([
      "Peer to peer",
      "Dock",
      "The Dock's own look",
    ]);
    expect(text(".mav-board-toast")).toContain(
      "Peer to peer will carry the calls, in place of LiveKit.",
    );
    expect(text(".mav-board-status")).toContain(
      "Your next setup: 1 to install, 1 to turn off.",
    );
    expect(calls.saved.at(-1)?.plan).toEqual([
      "modular-av-dock",
      "modular-av-p2p",
    ]);

    content.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    );

    expect(chain(content)).toEqual(["LiveKit", "Dock", "The Dock's own look"]);
    expect(calls.saved.at(-1)).toBeNull();
  });

  it("brings the Dock with a theme, and takes the theme out with it", async () => {
    const { content, click } = await open({
      "modular-av": { active: true },
      "modular-av-livekit": { active: true },
    });

    click("stage-look");
    click("tile-modular-av-dock-vines");
    click("inspect-act");
    expect(chain(content)).toEqual(["LiveKit", "Dock", "Vines theme"]);

    click("stage-cameras");
    click("tile-built-in:cameras");
    click("inspect-act");
    expect(chain(content)).toEqual(["LiveKit", "Foundry's own camera dock"]);
  });

  it("fills an empty chain with a starter build", async () => {
    const { content, click, q } = await open({
      "modular-av": { active: true },
    });
    expect(q(".mav-board-builds")).not.toBeNull();

    click("build-livekit");

    expect(chain(content)).toEqual([
      "Noise cancellation",
      "LiveKit",
      "Dock",
      "The Dock's own look",
    ]);
    expect(q(".mav-board-builds")).toBeNull();
  });

  it.each([
    ["a fresh world", { "modular-av": { active: true } }],
    ["a running world", RUNNING],
    [
      "a world with an update",
      { ...RUNNING, "modular-av-dock": { active: true, version: "0.3.1" } },
    ],
  ])("never shows a string's key, in %s", async (_case, world) => {
    const { content, click, q } = await open(world);
    const keys = new Set<string>();
    const look = () => {
      const found = content.textContent.match(/modular-av\.[\w.:-]+/g);
      for (const match of found ?? []) keys.add(match);
    };

    for (const stage of ["effects", "service", "cameras", "look"]) {
      click(`stage-${stage}`);
      for (const tile of content.querySelectorAll<HTMLElement>(
        ".mav-board-tile",
      )) {
        tile.click();
        look();
      }
    }
    for (const step of ["load", "live", "check"]) {
      if (
        q(`[data-key="objective-${step}"]`)?.getAttribute("aria-expanded") !==
        "true"
      )
        click(`objective-${step}`);
      look();
    }

    expect([...keys]).toEqual([]);
  });

  it("says a module is coming soon, with nothing to choose", async () => {
    const { click, q, text } = await open();

    click("stage-effects");
    click("tile-modular-av-livekit-krisp");

    expect(text(".mav-board-inspect")).toContain("Coming soon");
    expect(q('[data-key="inspect-act"]')).toBeNull();
  });
});

const choose = (click: (key: string) => void, stage: string, id: string) => {
  click(`stage-${stage}`);
  click(`tile-${id}`);
  click("inspect-act");
};

describe("the modules board's steps", () => {
  it("gives the fewest links, and leaves for Setup with them saved", async () => {
    const { calls, click, text, settle } = await open();
    choose(click, "service", "modular-av-p2p");

    expect(text(".mav-board-objectives")).toContain(url("modular-av-p2p"));
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

  it("keeps the running service on air until its replacement is installed", async () => {
    const { click, text, q } = await open();
    choose(click, "service", "modular-av-p2p");
    expect(text(".mav-board-leaving")).toBe(
      "LiveKit stays on air until Peer to peer is installed, so calls keep working.",
    );
    click("objective-live");

    expect(text(".mav-board-objectives")).toContain(
      "LiveKit stays on until Peer to peer is installed",
    );
    expect(q('[data-key="apply"]')?.disabled).toBe(true);
  });

  it("welcomes the GM back and goes live with what was installed", async () => {
    const { calls, click, text, settle } = await open(
      { ...RUNNING, "modular-av-p2p": { active: false } },
      { plan: ["modular-av-p2p", "modular-av-dock"], trip: ["modular-av-p2p"] },
    );
    expect(text(".mav-board-status")).toContain(
      "Welcome back: Peer to peer installed.",
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
  });

  it("never plans to turn off a running module the catalog doesn't know", async () => {
    const { text } = await open(
      { ...RUNNING, "modular-av-tokens": { active: true } },
      { plan: ["modular-av-livekit", "modular-av-dock"], trip: null },
    );

    expect(text(".mav-board-status")).toContain("On air as planned.");
  });

  it("keeps the plan when going live fails, and goes once however often clicked", async () => {
    const { calls, click, settle } = await open(
      { ...RUNNING, "modular-av-mic-denoise": { active: false } },
      null,
      true,
    );
    choose(click, "effects", "modular-av-mic-denoise");
    click("apply");

    click("apply-ok");
    click("apply-ok");
    await settle();

    expect(calls.applied).toHaveLength(1);
    expect(calls.errors).toHaveLength(1);
    expect(calls.saved.at(-1)?.plan).toContain("modular-av-mic-denoise");

    click("apply-ok");
    await settle();
    expect(calls.applied).toHaveLength(2);
  });

  it("opens each module's settings to check, ticking it off", async () => {
    const { calls, click, q } = await open();
    click("objective-check");

    click("check-foundry:modular-av-livekit");

    expect(calls.opened).toEqual([{ foundry: "modular-av-livekit" }]);
    expect(
      q('[data-key="objective-check"]')
        ?.closest(".mav-board-objective")
        ?.getAttribute("data-state"),
    ).toBe("done");
  });

  it("keeps its announcements in one place across redraws", async () => {
    const { content, click } = await open();
    const toast = content.querySelector(".mav-board-toast");

    choose(click, "service", "modular-av-p2p");
    click("undo");

    expect(content.querySelector(".mav-board-toast")).toBe(toast);
    expect(toast?.textContent).toContain("Undone.");
  });

  it("changes nothing once closed, whatever answers late", async () => {
    const { content, click, text, settle } = await open();
    choose(click, "service", "modular-av-p2p");
    const before = text(".mav-board-objectives");

    click("chat");
    mounted?.dispose();
    await settle();

    expect(text(".mav-board-objectives")).toBe(before);
    expect(
      content.querySelector(".mav-board-toast")?.textContent,
    ).not.toContain("Whispered");
  });
});
