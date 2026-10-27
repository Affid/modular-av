// @vitest-environment happy-dom
import type { Contribution, Observable } from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { openConnectionDetails } from "../src/menus/connection.ts";
import { openParticipantMenu } from "../src/menus/participant-menu.ts";
import { openQuickControls } from "../src/panel/quick-controls.ts";
import { playersSurface } from "../src/players/decorate.ts";
import { settle, testDock } from "./context.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });
const p1 = participantState({ id: "p1", name: "Player1", volume: 0.5 });
const state = avState({ participants: [me, p1] });

function cell<T>(value: T): Observable<T> & { set(v: T): void } {
  let current = value;
  let listeners: ((v: T) => void)[] = [];
  return {
    get: () => current,
    subscribe(l) {
      listeners.push(l);
      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
    set(v) {
      current = v;
      for (const l of listeners) l(v);
    },
  };
}

const anchor = (): HTMLButtonElement => {
  const button = document.createElement("button");
  document.body.append(button);
  return button;
};

describe("a participant's menu", () => {
  it("sets their volume, with a live meter of them", () => {
    const { ctx, api } = testDock({ state });

    const menu = openParticipantMenu(ctx, "p1", anchor());
    const slider = menu?.element.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    if (!slider) throw new Error("no slider");
    slider.value = "80";
    slider.dispatchEvent(new Event("input"));
    expect(slider.getAttribute("aria-valuetext")).toBe("80%");
    expect(api.calls).toEqual([]);
    slider.dispatchEvent(new Event("change"));

    expect(api.calls).toContainEqual({
      command: "setVolume",
      args: ["p1", 0.8],
    });
    expect(
      api.meterSubscriptions.map((m) => [m.participant, m.active]),
    ).toEqual([["p1", true]]);
    menu?.close();
    expect(api.meterSubscriptions[0]?.active).toBe(false);
  });

  it("hides them for this player only", () => {
    const { ctx, api } = testDock({ state });

    const menu = openParticipantMenu(ctx, "p1", anchor());
    menu?.element
      .querySelector<HTMLButtonElement>('[data-action="hide"]')
      ?.click();

    expect(api.calls).toContainEqual({
      command: "setHiddenByMe",
      args: ["p1", true],
    });
    expect(
      menu?.element.querySelector('[data-action="block-audio"]'),
    ).toBeNull();
  });

  it("lets a GM block their audio and video", () => {
    const { ctx, api } = testDock({ state, isGM: true });

    const menu = openParticipantMenu(ctx, "p1", anchor());
    menu?.element
      .querySelector<HTMLButtonElement>('[data-action="block-audio"]')
      ?.click();
    menu?.element
      .querySelector<HTMLButtonElement>('[data-action="block-video"]')
      ?.click();

    expect(api.calls).toEqual([
      { command: "setBroadcastPermissions", args: ["p1", { audio: false }] },
      { command: "setBroadcastPermissions", args: ["p1", { video: false }] },
    ]);
  });

  it("shows a GM's block on the switch, not what the world's mode leaves out", () => {
    const audioOnly = participantState({
      id: "p1",
      canBroadcast: { audio: true, video: false },
      blockedAudio: true,
    });
    const { ctx } = testDock({
      state: avState({
        participants: [me, audioOnly],
        worldMode: { audio: true, video: false },
      }),
      isGM: true,
    });

    const menu = openParticipantMenu(ctx, "p1", anchor());
    const checked = (action: string): string | null | undefined =>
      menu?.element
        .querySelector(`[data-action="${action}"]`)
        ?.getAttribute("aria-checked");

    expect([checked("block-audio"), checked("block-video")]).toEqual([
      "true",
      "false",
    ]);
  });

  it("offers other modules' actions where they apply, checked as they say", () => {
    const { ctx, api } = testDock({ state });
    const ran: string[] = [];
    const checked = cell<ReadonlySet<string>>(new Set(["p1"]));
    api.contributions.register({
      kind: "participant-action",
      id: "x.ignore",
      label: "Ignore",
      checked,
      run: (id) => {
        ran.push(id);
        return Promise.resolve();
      },
    });
    api.contributions.register({
      kind: "participant-action",
      id: "x.gm",
      label: "GM only",
      gmOnly: true,
      run: () => Promise.resolve(),
    });

    const menu = openParticipantMenu(ctx, "p1", anchor());
    const action = menu?.element.querySelector<HTMLButtonElement>(
      '[data-contribution="x.ignore"]',
    );
    action?.click();

    expect(ran).toEqual(["p1"]);
    expect(action?.getAttribute("aria-checked")).toBe("true");
    expect(
      menu?.element.querySelector('[data-contribution="x.gm"]'),
    ).toBeNull();
  });
});

describe("a participant's menu with a broken plugin", () => {
  it("still opens, without the plugin's action, and says why", () => {
    const { ctx, api, errors } = testDock({ state });
    api.contributions.register({
      kind: "participant-action",
      id: "x.broken",
      label: "Broken",
      appliesTo: () => {
        throw new Error("plugin bug");
      },
      run: () => Promise.resolve(),
    });

    const menu = openParticipantMenu(ctx, "p1", anchor());

    expect(menu).not.toBeNull();
    expect(
      menu?.element.querySelector('[data-contribution="x.broken"]'),
    ).toBeNull();
    expect(errors).toHaveLength(1);
  });
});

describe("connection details", () => {
  it("show what the service measured, and other modules' rows", async () => {
    const { ctx, api } = testDock({ state });
    api.setStats(null, { roundTripMs: 42, packetLoss: 0.012, relayed: true });
    api.contributions.register({
      kind: "status-row",
      id: "x.region",
      label: "Region",
      value: cell<string | null>("eu-west"),
    });

    const details = openConnectionDetails(ctx, anchor(), "me");
    await settle();

    const text = details.element.textContent;
    expect(text).toContain("42 ms");
    expect(text).toContain("1.2%");
    expect(text).toContain("RelayedYes");
    expect(text).toContain("eu-west");
    details.close();
  });

  it("say so when nothing was measured", async () => {
    const { ctx } = testDock({ state });

    const details = openConnectionDetails(ctx, anchor(), "p1");
    await settle();

    expect(details.element.textContent).toContain("Nothing measured yet");
    details.close();
  });
});

describe("quick controls", () => {
  const blur = (
    on: ReturnType<typeof cell<{ on: boolean }>>,
    set: boolean[],
  ): Contribution => ({
    kind: "control",
    place: "quick",
    type: "toggle",
    id: "x.blur",
    label: "Blur",
    state: on,
    set: (v) => {
      set.push(v);
      on.set({ on: v });
      return Promise.resolve();
    },
    controls: [
      {
        type: "range",
        id: "x.strength",
        label: "Strength",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        state: cell(30),
        set: () => Promise.resolve(),
      },
    ],
  });

  it("show a choice with pictures as pictures to pick, by mouse and keys", async () => {
    // Arrange
    const { ctx, api } = testDock({ state });
    const picked = cell("b");
    const set: string[] = [];
    api.contributions.register({
      kind: "control",
      place: "quick",
      type: "choice",
      id: "x.image",
      label: "Background image",
      options: ["a", "b", "c"].map((v) => ({
        value: v,
        label: `Image ${v}`,
        image: `/images/${v}.svg`,
      })),
      state: picked,
      set: (v) => {
        set.push(v);
        picked.set(v);
        return Promise.resolve();
      },
    });

    // Act
    const popover = openQuickControls(ctx, anchor());
    const group = popover.element.querySelector('[role="radiogroup"]');
    const radios = [
      ...popover.element.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ];
    radios[0]?.click();
    await settle();
    radios[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await settle();

    // Assert
    expect(group?.getAttribute("aria-label")).toBe("Background image");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Image a",
      "Image b",
      "Image c",
    ]);
    expect(
      radios.map((r) => r.querySelector("img")?.getAttribute("src")),
    ).toEqual(["/images/a.svg", "/images/b.svg", "/images/c.svg"]);
    expect(set).toEqual(["a", "b"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("show a choice's options anew when its value is one it didn't have", async () => {
    // Arrange: options read when drawn, as a plugin may grow them.
    const { ctx, api } = testDock({ state });
    const picked = cell("a");
    let values = ["a", "b"];
    api.contributions.register({
      kind: "control",
      place: "quick",
      type: "choice",
      id: "x.image",
      label: "Background image",
      get options() {
        return values.map((v) => ({ value: v, label: v, image: `/${v}.png` }));
      },
      state: picked,
      set: () => Promise.resolve(),
    });
    const popover = openQuickControls(ctx, anchor());

    // Act: the player picked their own image.
    values = [...values, "mine"];
    picked.set("mine");
    await settle();

    // Assert
    const radios = [
      ...popover.element.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ];
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "a",
      "b",
      "mine",
    ]);
    expect(radios.at(-1)?.getAttribute("aria-checked")).toBe("true");
    expect(
      radios[0]?.querySelector("img")?.getAttribute("referrerpolicy"),
    ).toBe("no-referrer");
  });

  it("render a plugin's toggle with what it shows while on", () => {
    const { ctx, api } = testDock({ state });
    const on = cell({ on: false });
    const set: boolean[] = [];
    api.contributions.register(blur(on, set));

    const popover = openQuickControls(ctx, anchor());
    const toggle =
      popover.element.querySelector<HTMLButtonElement>('[role="switch"]');
    toggle?.click();

    expect(set).toEqual([true]);
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    const strength = popover.element.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    expect(strength?.value).toBe("30");
    expect(strength?.getAttribute("aria-valuetext")).toBe("30%");
  });

  it("show an exclusive group of effects as one choice, with its state", () => {
    const { ctx, api } = testDock({
      state: avState({
        participants: [me],
        local: { effects: { rnnoise: { status: "running", error: null } } },
      }),
    });
    for (const id of ["rnnoise", "speex"])
      api.effects.register({
        id,
        kind: "audio",
        label: id,
        stage: "denoise",
        exclusiveGroup: "noise-suppression",
        cost: "light",
        isSupported: () => true,
        create: () => Promise.reject(new Error("unused")),
      });

    const popover = openQuickControls(ctx, anchor());
    const select = popover.element.querySelector<HTMLSelectElement>(
      '[data-effect-group="noise-suppression"]',
    );
    if (!select) throw new Error("no group");
    expect(select.value).toBe("rnnoise");
    expect(popover.element.textContent).toContain("Noise cancellation");
    expect(popover.element.textContent).toContain("On · Light");
    select.value = "";
    select.dispatchEvent(new Event("change"));

    expect(api.calls).toContainEqual({
      command: "setEffectEnabled",
      args: ["rnnoise", false],
    });
  });
});

describe("the player list", () => {
  it("marks who speaks and shows their states, following the state in place", async () => {
    const { ctx, api } = testDock({ state });
    const list = document.createElement("ol");
    list.innerHTML =
      '<li data-user-id="p1">Player1</li><li data-user-id="p9">Away</li>';
    document.body.append(list);

    playersSurface(ctx).decorate(list);
    api.setState((s) => ({
      ...s,
      participants: {
        ...s.participants,
        p1: { ...p1, speaking: true, muted: true },
      },
    }));
    await settle();

    const item = list.querySelector<HTMLElement>('[data-user-id="p1"]');
    expect(item?.hasAttribute("data-speaking")).toBe(true);
    expect(item?.hasAttribute("data-in-call")).toBe(true);
    expect(item?.querySelector('[data-indicator="muted"]')).not.toBeNull();
    expect(
      list.querySelector('[data-user-id="p9"] [data-indicator]'),
    ).toBeNull();
  });
});
