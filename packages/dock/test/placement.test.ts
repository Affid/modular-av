// @vitest-environment happy-dom
import type { SettingsHost } from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { renderSettings } from "../src/settings-window/window.ts";
import { fakeHost, settle, testDock, type TestDockOptions } from "./context.ts";

beforeEach(() => {
  window.innerWidth = 1200;
  window.innerHeight = 800;
});

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });

function dock(options: TestDockOptions = {}) {
  const test = testDock({ state: avState({ participants: [me] }), ...options });
  const host = fakeHost("right");
  camerasSurface(test.ctx).mount(host);
  const root = host.element.querySelector<HTMLElement>(".mav-dock");
  if (!root) throw new Error("not mounted");
  const placement = async (name: string): Promise<void> => {
    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();
    document
      .querySelector<HTMLButtonElement>(
        `[data-placement="${name}"][role="menuitemradio"]`,
      )
      ?.click();
    await settle();
  };
  return { ...test, host, root, placement };
}

describe("where the dock is", () => {
  it("starts on Foundry's dock side", async () => {
    const { root, host } = dock();
    await settle();

    expect(root.dataset.placement).toBe("right");
    expect(host.placements.at(-1)).toBe("right");
  });

  it("docks on another side through the placement menu", async () => {
    const { root, host, placement } = dock();

    await placement("top");

    expect(root.dataset.placement).toBe("top");
    expect(host.placements.at(-1)).toBe("top");
  });

  it("floats where it was left, kept on screen, and remembers it", async () => {
    const { root, host, placement, saved } = dock();
    saved.set("modular-av-dock.floatingRect", {
      left: 2000,
      top: 50,
      width: 300,
      height: 200,
    });

    await placement("floating");

    expect(root.dataset.placement).toBe("floating");
    expect(host.placements.at(-1)).toBe("free");
    expect([root.style.left, root.style.top]).toEqual(["892px", "50px"]);
    expect(saved.get("modular-av-dock.mode")).toBe("floating");
  });

  it("offers its own window only where the browser can", () => {
    const { host } = dock();

    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();
    const item = document.querySelector<HTMLButtonElement>(
      '[data-placement="window"]',
    );

    expect(item?.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "A window of its own needs Chrome or Edge.",
    );
  });

  it("moves into its own window and comes back when it closes", async () => {
    const { root, host, placement, api } = dock({ pip: true });

    await placement("window");
    const pip = api.windows.pip.current;

    expect(pip?.owner).toBe("modular-av-dock");
    expect(root.ownerDocument).toBe(pip?.document);
    expect(host.placements.at(-1)).toBe("free");
    pip?.close();
    await settle();
    expect(root.parentElement).toBe(host.element);
    expect(root.dataset.placement).toBe("right");
  });

  it("collapses to its header and panel, and remembers it", () => {
    const { root, host, saved } = dock();

    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-collapse")
      ?.click();

    expect(root.hasAttribute("data-collapsed")).toBe(true);
    expect(saved.get("modular-av-dock.collapsed")).toBe(true);
    expect(
      host.element
        .querySelector(".mav-dock-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });
});

describe("the settings window", () => {
  function open(
    options: TestDockOptions = {},
    before: (api: ReturnType<typeof testDock>["api"]) => void = () => undefined,
    extra: Partial<SettingsHost> = {},
  ) {
    const test = testDock({
      state: avState({
        participants: [me],
        devices: {
          audioInput: [{ id: "usb", label: "USB mic" }],
          videoInput: [],
          audioOutput: [],
        },
      }),
      ...options,
    });
    const content = document.createElement("section");
    document.body.append(content);
    let foundry = 0;
    const host: SettingsHost = {
      content,
      close: () => Promise.resolve(),
      openFoundrySettings: () => {
        foundry += 1;
      },
      ...extra,
    };
    before(test.api);
    const undo = renderSettings(test.ctx, host);
    return { ...test, content, undo, foundry: () => foundry };
  }

  it("chooses devices, the voice mode and others' video through commands", () => {
    const { content, api } = open();

    const selects = content.querySelectorAll("select");
    const mic = selects[0];
    if (!mic) throw new Error("no microphone choice");
    expect(Array.from(mic.options, (o) => o.textContent)).toEqual([
      "System default",
      "USB mic",
    ]);
    mic.value = "usb";
    mic.dispatchEvent(new Event("change"));
    const mode = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === "ptt"),
    );
    if (!mode) throw new Error("no voice mode");
    mode.value = "ptt";
    mode.dispatchEvent(new Event("change"));
    const receive = Array.from(
      content.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    ).find((b) => b.textContent === "Show other players' video");
    receive?.click();

    expect(api.calls).toEqual([
      { command: "setDevice", args: ["audioInput", "usb"] },
      { command: "setVoiceMode", args: ["ptt"] },
      { command: "setReceiveVideo", args: [false] },
    ]);
  });

  it("shows a chosen device that isn't connected now", () => {
    const { content } = open({
      state: avState({
        participants: [me],
        local: {
          chosenDevices: {
            audioInput: "gone",
            videoInput: "default",
            audioOutput: "default",
          },
        },
      }),
    });

    const mic = content.querySelector("select");

    expect(mic?.value).toBe("gone");
    expect(mic?.selectedOptions[0]?.textContent).toBe("Not connected now");
  });

  it("shows the push to talk key and sends the player to Foundry's controls", () => {
    const { content, opened } = open({ pushToTalk: ["Backquote"] });

    expect(content.textContent).toContain("Push to talk key: Backquote");
    Array.from(content.querySelectorAll("button"))
      .find((b) => b.textContent === "Change in Foundry's controls")
      ?.click();

    expect(opened.controls).toBe(1);
  });

  it("renders another module's settings, never showing a secret", () => {
    const settings = [
      {
        namespace: "lk",
        key: "url",
        name: "Server URL",
        scope: "world" as const,
        type: String,
        value: "wss://x",
      },
      {
        namespace: "lk",
        key: "secret",
        name: "API secret",
        scope: "client" as const,
        type: String,
        value: "s3cret",
      },
    ];
    const section = {
      kind: "settings-section" as const,
      id: "lk.section",
      label: "LiveKit",
      settings: ["lk.url", "lk.secret"],
      secrets: ["lk.secret"],
    };

    const gm = open({ isGM: true, foundrySettings: settings }, (api) => {
      api.contributions.register(section);
    });
    const player = open({ foundrySettings: settings }, (api) => {
      api.contributions.register(section);
    });

    const url = gm.content.querySelector<HTMLInputElement>(
      '[data-contribution="lk.section"] input[type="text"]',
    );
    const secret = gm.content.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    expect(url?.value).toBe("wss://x");
    expect(secret?.value).toBe("");
    expect(gm.content.innerHTML).not.toContain("s3cret");
    if (!secret) throw new Error("no secret field");
    secret.value = "new";
    secret.dispatchEvent(new Event("change"));
    expect(gm.saved.get("lk.secret")).toBe("new");
    expect(player.content.textContent).not.toContain("Server URL");
    expect(player.content.textContent).toContain("API secret");
  });

  it("never shows a secret of any type, nor what was typed when saving fails", async () => {
    const settings = [
      {
        namespace: "lk",
        key: "flag",
        name: "Secret flag",
        scope: "client" as const,
        type: Boolean,
        value: true,
      },
      {
        namespace: "lk",
        key: "data",
        name: "Some data",
        scope: "client" as const,
        type: Object,
        value: { a: 1 },
      },
    ];
    const { content, ctx } = open({ foundrySettings: settings }, (api) => {
      api.contributions.register({
        kind: "settings-section",
        id: "lk.section",
        label: "LiveKit",
        settings: ["lk.flag", "lk.data"],
        secrets: ["lk.flag"],
      });
    });
    ctx.settings.set = () => Promise.reject(new Error("Invalid value hunter2"));

    const field = content.querySelector<HTMLInputElement>(
      '[data-contribution="lk.section"] input',
    );
    expect(field?.type).toBe("password");
    expect(field?.value).toBe("");
    expect(content.textContent).not.toContain("Some data");
    if (!field) throw new Error("no field");
    field.value = "hunter2";
    field.dispatchEvent(new Event("change"));
    await settle();

    expect(field.value).toBe("");
    expect(content.textContent).not.toContain("hunter2");
    expect(content.textContent).toContain("That wasn't saved.");
  });

  it("still reaches Foundry's own A/V settings", () => {
    const { content, foundry } = open();

    Array.from(content.querySelectorAll("button"))
      .find((b) => b.textContent === "Foundry's A/V settings")
      ?.click();

    expect(foundry()).toBe(1);
  });

  it("offers a GM the modules window, and a player nothing of it", () => {
    let modules = 0;
    const gm = open({}, undefined, {
      openModules: () => {
        modules += 1;
      },
    });
    const plan = (content: HTMLElement) =>
      Array.from(content.querySelectorAll("button")).find(
        (b) => b.textContent === "Plan your modules",
      );

    plan(gm.content)?.click();
    const player = open();

    expect(modules).toBe(1);
    expect(plan(player.content)).toBeUndefined();
  });
});
