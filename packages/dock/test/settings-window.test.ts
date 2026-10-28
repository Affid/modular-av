// @vitest-environment happy-dom
import type {
  SettingsHost,
  SettingsSectionContribution,
  VideoEffectDefinition,
} from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { renderSettings } from "../src/settings-window/window.ts";
import type { Themes } from "../src/themes/choice.ts";
import { settle, testDock, type TestDockOptions } from "./context.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });
const setting = (namespace: string, key: string, value: unknown) => ({
  namespace,
  key,
  scope: "world" as const,
  value,
});
const WORLD = setting("core", "rtcWorldSettings", {
  mode: 3,
  turn: { type: "server", url: "", username: "", password: "" },
});
const SERVICE = {
  ...setting("modular-av", "service", "livekit"),
  choices: { livekit: "LiveKit", p2p: "Peer to peer" },
};

function open(
  options: TestDockOptions = {},
  before: (dock: ReturnType<typeof testDock>) => void = () => undefined,
  extra: Partial<SettingsHost> = {},
) {
  const dock = testDock({
    state: avState({ participants: [me] }),
    foundrySettings: [WORLD, SERVICE],
    ...options,
  });
  before(dock);
  const content = document.createElement("section");
  document.body.append(content);
  let foundry = 0;
  const undo = renderSettings(dock.ctx, {
    content,
    close: () => Promise.resolve(),
    openFoundrySettings: () => {
      foundry += 1;
    },
    ...extra,
  });
  const q = (selector: string) =>
    content.querySelector<HTMLInputElement>(selector);
  const select = (field: string) =>
    content.querySelector<HTMLSelectElement>(`select[data-field="${field}"]`);
  const tab = (id: string) => {
    q(`[role="tab"][data-tab="${id}"]`)?.click();
  };
  const button = (text: string) =>
    [...content.querySelectorAll("button")].find((b) => b.textContent === text);
  const footer = () => q(".mav-settings-pending")?.textContent ?? "";
  const save = async () => {
    q('[data-action="save"]')?.click();
    await settle();
  };
  const choose = (field: string, value: string) => {
    const select = q(`select[data-field="${field}"]`);
    if (!select) throw new Error(`no ${field}`);
    select.value = value;
    select.dispatchEvent(new Event("change"));
  };
  return {
    ...dock,
    ...{ content, undo, q, select, tab, button, footer, save, choose },
    foundry: () => foundry,
  };
}

describe("the settings window's Call tab", () => {
  it("lets a GM turn the world's calls off, saved with everyone's reload", async () => {
    const view = open({ isGM: true });

    view.q('[data-mode="off"]')?.click();

    expect(view.footer()).toBe(
      "1 unsaved change. Saving reloads everyone's page.",
    );
    expect(view.q('[data-action="save"]')?.textContent).toBe("Save and reload");
    await view.save();
    expect(view.saved.get("core.rtcWorldSettings")).toMatchObject({ mode: 0 });
    expect(view.reloads).toEqual([true]);
  });

  it("gives a GM the service, the relay, the modules window and Foundry's own", () => {
    let modules = 0;
    const view = open({ isGM: true }, undefined, {
      openModules: () => {
        modules += 1;
      },
    });

    view.choose("relayType", "custom");
    view.button("Plan your modules")?.click();
    view.button("Foundry's A/V settings")?.click();

    expect(view.q('[data-field="service"]')?.value).toBe("livekit");
    expect(view.q('[data-field="relay-url"]')?.closest("[hidden]")).toBeNull();
    expect([modules, view.foundry()]).toEqual([1, 1]);
  });

  it("shows a player whether calls are on, and nothing to set", () => {
    const view = open({
      state: avState({
        participants: [me],
        worldMode: { audio: true, video: true },
      }),
    });

    expect(view.q(".mav-call-state")?.textContent).toContain("on");
    expect(view.q("[data-mode]")).toBeNull();
    expect(view.button("Plan your modules")).toBeUndefined();
  });
});

describe("the settings window's Voice tab", () => {
  it("changes nothing until saved, and marks its tab", async () => {
    const view = open({
      state: avState({
        participants: [me],
        devices: {
          audioInput: [{ id: "usb", label: "USB mic" }],
          videoInput: [],
          audioOutput: [],
        },
      }),
    });
    view.tab("voice");

    view.choose("audioInput", "usb");
    view.choose("voiceMode", "ptt");

    expect(view.api.calls).toEqual([]);
    expect(view.q('[data-tab="voice"]')?.hasAttribute("data-unsaved")).toBe(
      true,
    );
    expect(view.footer()).toBe("2 unsaved changes. Nothing reloads.");
    await view.save();
    expect(view.api.calls).toEqual([
      { command: "setDevice", args: ["audioInput", "usb"] },
      { command: "setVoiceMode", args: ["ptt"] },
    ]);
    expect(view.footer()).toBe("Saved.");
  });

  it("shows a chosen device that isn't connected now", () => {
    const view = open({
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
    view.tab("voice");

    const mic = view.select("audioInput");

    expect(mic?.value).toBe("gone");
    expect(mic?.selectedOptions[0]?.textContent).toBe("Not connected now");
  });

  it("sets push to talk's key in place", async () => {
    const view = open({
      state: avState({ participants: [me], local: { voiceMode: "ptt" } }),
      pushToTalk: ["Backquote"],
    });
    view.tab("voice");
    const key = view.q('[data-field="pttKey"]');
    expect(key?.textContent).toBe("Backquote");

    key?.click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "v", code: "KeyV", bubbles: true }),
    );
    await view.save();

    expect(key?.textContent).toBe("KeyV");
    expect(view.pushToTalkSet).toEqual([["KeyV"]]);
  });

  it("previews the microphone's level for voice activity, and stops it when left", async () => {
    const view = open({
      state: avState({ participants: [me], local: { voiceMode: "activity" } }),
    });
    view.tab("voice");
    await settle();
    const preview = view.api.preview.all[0];

    view.api.preview.level(-20);

    expect(preview).toMatchObject({ kind: "microphone", device: "default" });
    expect(
      view.q('.mav-sensitivity [role="meter"]')?.getAttribute("aria-valuenow"),
    ).toBe("-20");
    view.tab("video");
    expect(view.api.preview.all[0]?.stopped).toBe(true);
  });

  it("says effects are modules of their own when none is enabled", () => {
    const view = open({}, undefined, { openModules: () => undefined });
    view.tab("voice");

    expect(view.content.textContent).toContain(
      "Noise cancellation and a camera background are modules of their own",
    );
    expect(view.button("Plan your modules")).toBeDefined();
  });
});

describe("the settings window's Video tab", () => {
  const background = (id: string): VideoEffectDefinition => ({
    id,
    kind: "video",
    label: id,
    exclusiveGroup: "camera-background",
    cost: "medium",
    isSupported: () => true,
    create: () => Promise.reject(new Error("unused")),
  });
  const withBackgrounds = (dock: ReturnType<typeof testDock>) => {
    dock.api.effects.register(background("background-blur"));
    dock.api.effects.register(background("background-replace"));
  };

  it("previews the drafted camera through the drafted background, outside any call", async () => {
    const view = open({}, withBackgrounds);
    view.tab("video");
    await settle();

    view.q('[data-effect="background-blur"]')?.click();
    await settle();

    expect(
      view.api.preview.all.map((p) => [p.kind, p.effect, p.stopped]),
    ).toEqual([
      ["camera", null, true],
      ["camera", "background-blur", false],
    ]);
    expect(view.api.calls).toEqual([]);
    expect(view.q('[data-tab="video"]')?.hasAttribute("data-unsaved")).toBe(
      true,
    );
  });

  it("says how to allow a camera the browser refused", async () => {
    const view = open({}, (dock) => {
      dock.api.preview.refuseNext("camera", "NotAllowedError");
    });
    view.tab("video");
    await settle();

    expect(view.q(".mav-preview-note")?.textContent).toContain("Allow");
  });
});

describe("the settings window's Appearance tab", () => {
  function themes(): Themes & { readonly chosen: string[] } {
    const chosen: string[] = [];
    return {
      chosen,
      list: () => [{ id: "vines", label: "Vines", styles: [] } as never],
      own: () => "",
      worldDefault: () => "default",
      shown: () => null,
      choose: (id) => {
        chosen.push(`own:${id}`);
        return Promise.resolve();
      },
      chooseWorldDefault: (id) => {
        chosen.push(`world:${id}`);
        return Promise.resolve();
      },
      onChange: () => () => undefined,
      changed: () => undefined,
    };
  }

  it("gives a GM one theme, for everyone", async () => {
    const chosen = themes();
    const view = open({ isGM: true, themes: chosen });
    view.tab("appearance");

    view.choose("theme", "vines");
    await view.save();

    expect(view.content.textContent).toContain("Theme for everyone");
    expect(chosen.chosen).toEqual(["world:vines", "own:"]);
  });

  it("gives a player their own, following the GM's first", () => {
    const view = open({ themes: themes() });
    view.tab("appearance");

    const select = view.select("theme");

    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      "As the GM chose (Modular A/V's own look)",
      "Modular A/V's own look",
      "Vines",
    ]);
  });
});

describe("the settings window's More tab", () => {
  const section: SettingsSectionContribution = {
    kind: "settings-section",
    id: "lk.section",
    label: "LiveKit",
    settings: ["lk.url", "lk.secret"],
    secrets: ["lk.secret"],
  };
  const settings = [
    { ...setting("lk", "url", "wss://x"), name: "Server URL", type: String },
    {
      ...setting("lk", "secret", "s3cret"),
      scope: "client" as const,
      name: "API secret",
      type: String,
    },
  ];

  it("holds other modules' sections that name no tab, never showing a secret", () => {
    const gm = open(
      { isGM: true, foundrySettings: [WORLD, SERVICE, ...settings] },
      (d) => {
        d.api.contributions.register(section);
      },
    );
    gm.tab("more");

    const url = gm.q('[data-contribution="lk.section"] input[type="text"]');
    const secret = gm.q('input[type="password"]');

    expect(url?.value).toBe("wss://x");
    expect(secret?.value).toBe("");
    expect(gm.content.innerHTML).not.toContain("s3cret");
  });

  it("isn't there when every section names its tab", () => {
    const view = open();

    expect(view.q('[data-tab="more"]')).toBeNull();
  });
});

describe("the settings window's footer", () => {
  it("resets what was drafted", () => {
    const view = open({ isGM: true });
    view.q('[data-mode="audio"]')?.click();

    view.q('[data-action="reset"]')?.click();

    expect(view.q('[data-mode="both"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(view.footer()).toBe("Changes discarded.");
  });
});
