// @vitest-environment happy-dom
import type { ControlContribution, Observable } from "@modular-av/api";
import { participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Layers, LayerStatus } from "../src/layers/layers.ts";
import type { Snapshot } from "../src/model/snapshot.ts";
import { NOISE_KEY } from "../src/model/rack.ts";
import { dropIndex } from "../src/window/routing.ts";
import { renderMixer } from "../src/window/view.ts";
import { act } from "./act.ts";
import { effect, type Setup, testMixer } from "./context.ts";

const rnnoise = effect("rnnoise", "pre-gate", {
  exclusiveGroup: "noise-suppression",
  label: "RNNoise",
});
const gtcrn = effect("gtcrn", "pre-gate", {
  exclusiveGroup: "noise-suppression",
  label: "GTCRN",
});
const eq = effect("eq", "pre-gate");
const radio = effect("radio", "post-gate");
const reverb = effect("reverb", "send", { tail: 3 });
const echo = effect("echo", "send", { tail: 2 });
const ALL = [rnnoise, gtcrn, eq, radio, reverb, echo];

const NO_ORDER = { "pre-gate": [], "post-gate": [], send: [] } as const;

/** RNNoise and Reverb on, EQ kept but off. */
const CHAIN: Setup = {
  effects: ALL,
  local: {
    chosenEffects: ["rnnoise", "reverb"],
    audioEffectOrder: { ...NO_ORDER, "pre-gate": ["rnnoise", "eq"] },
    audioEffectMix: { reverb: 0.4, echo: 0.25 },
    audioChannelLevel: 0.7,
    effects: {
      rnnoise: { status: "running", error: null },
      reverb: { status: "running", error: null },
    },
  },
};

function fakeLayers(
  states: readonly LayerStatus[],
  held: Snapshot | null,
): Layers & { readonly refused: string[] } {
  const refused: string[] = [];
  return {
    refused,
    reconcile: () => Promise.resolve(),
    refuse: (id) => {
      refused.push(id);
      return Promise.resolve();
    },
    accept: () => Promise.resolve(),
    keptOut: () => false,
    setKeptOut: () => Promise.resolve(),
    states: () => states,
    held: () => held,
    takeHeld: (s) => Promise.resolve(s),
    free: (s) => s,
    underneath: (s) => s,
    changed: () => undefined,
    subscribe: () => () => undefined,
  };
}

function open(setup: Setup = CHAIN, layers?: Layers) {
  const mixer = testMixer(setup);
  const ctx = layers ? { ...mixer.ctx, layers } : mixer.ctx;
  const view = renderMixer(ctx, document);
  document.body.replaceChildren(view.element);
  const q = (selector: string): HTMLElement => {
    const found = view.element.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`no ${selector}`);
    return found;
  };
  const input = (selector: string) => q(selector) as HTMLInputElement;
  const select = (selector: string) => q(selector) as HTMLSelectElement;
  const button = (selector: string) => q(selector) as HTMLButtonElement;
  const card = (key: string): HTMLElement => {
    const found = [
      ...view.element.querySelectorAll<HTMLElement>("[data-key]"),
    ].find((c) => c.dataset.key === key);
    if (!found) throw new Error(`no card ${key}`);
    return found;
  };
  const keys = (part: string) =>
    [
      ...view.element.querySelectorAll<HTMLElement>(
        `[data-part="${part}"] [data-key]`,
      ),
    ].map((c) => c.dataset.key);
  const press = (
    target: HTMLElement,
    key: string,
    init: KeyboardEventInit = {},
  ) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  const calls = () => mixer.api.calls.map((c) => [c.command, ...c.args]);
  return { ...mixer, view, q, input, select, button, card, keys, press, calls };
}

const fixed = <T>(value: T): Observable<T> => ({
  get: () => value,
  subscribe: () => () => undefined,
});

const decay = {
  kind: "control",
  place: "quick",
  effect: "reverb",
  type: "range",
  id: "decay",
  label: "Decay",
  min: 0.3,
  max: 3,
  step: 0.1,
  state: fixed(1.5),
  set: vi.fn(() => Promise.resolve()),
} as unknown as ControlContribution;

afterEach(() => {
  localStorage.clear();
});

describe("the routing panel", () => {
  it("draws only the chain, place by place, with the gate between", () => {
    const { view, keys } = open();

    const parts = [
      ...view.element.querySelectorAll<HTMLElement>(
        '[data-panel="routing"] [data-part]',
      ),
    ].map((p) => p.dataset.part);

    expect(parts).toEqual(["pre-gate", "gate", "post-gate", "send"]);
    expect(keys("pre-gate")).toEqual([NOISE_KEY, "eq"]);
    expect(keys("post-gate")).toEqual([]);
    expect(keys("send")).toEqual(["reverb"]);
  });

  it("tells on, off and waiting apart in words, not only colour", () => {
    const { card } = open({
      ...CHAIN,
      local: {
        ...CHAIN.local,
        chosenEffects: ["rnnoise", "reverb"],
        effects: { reverb: { status: "unavailable", error: null } },
      },
    });

    expect(card("eq").dataset.state).toBe("off");
    expect(card("eq").getAttribute("aria-label")).toContain("Off");
    expect(card("reverb").dataset.state).toBe("waiting");
    expect(card("reverb").textContent).toContain("Waiting");
  });

  it("shows a contributed label as text, never as markup", () => {
    const bad = effect("bad", "send", { label: "<img src=x>" });

    const { view } = open({
      effects: [bad],
      local: { chosenEffects: ["bad"] },
    });

    expect(view.element.querySelector("img")).toBeNull();
    expect(view.element.textContent).toContain("<img src=x>");
  });

  it("switches a card off with its dot, keeping it in the chain", async () => {
    const { q, calls } = open();

    q('[data-field="on.reverb"]').click();
    await act();

    expect(calls()).toEqual([
      ["setAudioPipeline", { order: { send: ["reverb"] } }],
      ["setEffectEnabled", "reverb", false],
    ]);
  });

  it("is one tab stop: arrows move along a place and across places", () => {
    const { card, press } = open();
    const stops = () =>
      [...document.querySelectorAll<HTMLElement>("[data-key]")].filter(
        (c) => c.tabIndex === 0,
      );

    press(card(NOISE_KEY), "ArrowDown");
    const down = document.activeElement;
    press(card("eq"), "ArrowRight");

    expect(down).toBe(card("eq"));
    expect(document.activeElement).toBe(card("reverb"));
    expect(stops()).toEqual([card("reverb")]);
  });

  it("switches with Space, removes with Delete, moves with Alt and arrows", async () => {
    const { card, press, calls } = open();

    press(card("eq"), " ");
    press(card("eq"), "ArrowUp", { altKey: true });
    press(card("reverb"), "Delete");
    await act();

    expect(calls()).toEqual([
      ["setEffectEnabled", "eq", true],
      ["setAudioPipeline", { order: { "pre-gate": ["eq", "rnnoise"] } }],
      ["setAudioPipeline", { order: { send: [] } }],
      ["setEffectEnabled", "reverb", false],
    ]);
  });

  it("moves a card to the next place with Alt and Right", async () => {
    const { card, press, calls } = open();

    press(card("eq"), "ArrowRight", { altKey: true });
    await act();

    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        {
          places: { eq: "post-gate" },
          order: { "pre-gate": ["rnnoise"], "post-gate": ["eq"] },
        },
      ],
    ]);
  });

  it("selects a card together with its fader", () => {
    const { card, q } = open();

    card("reverb").click();

    expect(card("reverb").getAttribute("aria-current")).toBe("true");
    expect(q('[data-fader="reverb"]').dataset.selected).toBe("");
  });

  it("shows a send's Return level on its card, and L goes to the fader", () => {
    const { card, press, q } = open();

    press(card("reverb"), "l");

    expect(q('[data-field="level.reverb"]').textContent).toBe("40%");
    expect(document.activeElement).toBe(q('[data-field="mix.reverb"]'));
  });

  it("shows the gate's live level against its threshold", async () => {
    const { api, q } = open();
    api.setState((s) => ({
      ...s,
      participants: { me: participantState({ id: "me", isLocal: true }) },
    }));
    await act();

    api.emitLevel("me", { db: -30, threshold: -45, open: true });

    expect(q('[data-part="gate"]').textContent).toContain("Open");
  });

  it("locks what a GM's layer holds and names the layer", () => {
    const held: Snapshot = { effects: { reverb: { on: true, mix: 0.5 } } };
    const layers = fakeLayers(
      [{ id: "cave", label: "The cave", state: "applied" }],
      held,
    );

    const { card, input, button } = open(CHAIN, layers);

    expect(card("reverb").dataset.held).toBe("");
    expect(card("reverb").textContent).toContain("The cave");
    expect(button('[data-field="on.reverb"]').disabled).toBe(true);
    expect(input('[data-field="mix.reverb"]').disabled).toBe(true);
  });
});

describe("dragging a card", () => {
  it("lands before the first card whose middle is below the pointer", () => {
    expect(dropIndex([10, 40, 70], 5)).toBe(0);
    expect(dropIndex([10, 40, 70], 50)).toBe(2);
    expect(dropIndex([10, 40, 70], 90)).toBe(3);
    expect(dropIndex([], 90)).toBe(0);
  });

  it("moves it into the place it is dropped on, and says where while over", async () => {
    // Arrange
    const { card, q, calls } = open();
    const drag = (type: string, target: HTMLElement, clientY = 0) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY,
      });
      target.dispatchEvent(event);
      return event;
    };

    // Act
    drag("dragstart", card("eq"));
    const over = drag("dragover", q('[data-part="send"]'), 10);
    const said = q('[data-field="announce"]').textContent;
    drag("drop", q('[data-part="send"]'), 10);
    drag("dragend", card("eq"));
    await act();

    // Assert
    expect(over.defaultPrevented).toBe(true);
    expect(said).toBe("EQ: Sends, 2 of 2");
    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        {
          places: { eq: "send" },
          order: { "pre-gate": ["rnnoise"], send: ["reverb", "eq"] },
        },
      ],
    ]);
  });

  it("can't drag what a GM's layer pins", () => {
    const layers = fakeLayers(
      [{ id: "cave", label: "The cave", state: "applied" }],
      { effects: { reverb: { place: "send" } } },
    );

    const { card } = open(CHAIN, layers);

    expect(card("reverb").getAttribute("draggable")).toBeNull();
    expect(card("eq").getAttribute("draggable")).toBe("true");
  });
});

describe("the window following the core", () => {
  it("shows a change of state in place, so a fader being dragged stays", async () => {
    const { q, card, setLocal } = open({
      ...CHAIN,
      local: {
        ...CHAIN.local,
        effects: { reverb: { status: "starting", error: null } },
      },
    });
    const fader = q('[data-field="mix.reverb"]');
    const before = card("reverb");

    await setLocal({ effects: { reverb: { status: "running", error: null } } });

    expect(card("reverb")).toBe(before);
    expect(card("reverb").dataset.state).toBe("on");
    expect(q('[data-field="mix.reverb"]')).toBe(fader);
  });

  it("redraws when the core moves something, keeping the keyboard on its card", async () => {
    const { card, setLocal } = open();
    card("eq").focus();

    await setLocal({
      audioEffectOrder: { ...NO_ORDER, "pre-gate": ["eq", "rnnoise"] },
    });

    expect(document.activeElement).toBe(card("eq"));
    expect(card("eq").tabIndex).toBe(0);
  });
});

describe("after the code review", () => {
  it("makes a plan when it runs, from the chain then", async () => {
    const { card, press, calls, api } = open();

    // Switching it on is still being written when the move is asked for.
    press(card("eq"), " ");
    press(card("eq"), "ArrowUp", { altKey: true });
    // The core moved it meanwhile, before the move's turn came.
    api.setState((s) => ({
      ...s,
      local: {
        ...s.local,
        audioEffectOrder: { ...NO_ORDER, "pre-gate": ["eq", "rnnoise"] },
      },
    }));
    await act();

    expect(calls()).toEqual([["setEffectEnabled", "eq", true]]);
  });

  it("keeps the keys off what a GM's layer holds", async () => {
    const layers = fakeLayers(
      [{ id: "cave", label: "The cave", state: "applied" }],
      { effects: { reverb: { on: true, place: "send" } } },
    );
    const { card, press, calls } = open(CHAIN, layers);

    press(card("reverb"), " ");
    press(card("reverb"), "Delete");
    press(card("reverb"), "ArrowLeft", { altKey: true });
    await act();

    expect(calls()).toEqual([]);
  });

  it("closes a pop-up when its button is pressed again", () => {
    const { q, view } = open();

    q('[data-field="settings.reverb"]').click();
    q('[data-field="settings.reverb"]').click();

    expect(view.element.querySelector('[data-pop="settings"]')).toBeNull();
  });

  it("keeps the gate's pop-up open across a redraw", async () => {
    const { q, setLocal, view } = open();

    q('[data-field="settings.gate"]').click();
    await setLocal({
      audioEffectOrder: { ...NO_ORDER, "pre-gate": ["eq", "rnnoise"] },
    });

    expect(view.element.querySelector('[data-pop="gate"]')).not.toBeNull();
  });

  it("moves the noise card when picked again, keeping its model", async () => {
    const { q, calls } = open({
      ...CHAIN,
      local: {
        ...CHAIN.local,
        chosenEffects: ["gtcrn", "reverb"],
        audioEffectOrder: { ...NO_ORDER, "pre-gate": ["gtcrn", "eq"] },
      },
    });

    q('[data-field="add.post-gate"]').click();
    q(`[data-offer="${NOISE_KEY}"]`).click();
    await act();

    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        {
          places: { gtcrn: "post-gate" },
          order: { "pre-gate": ["eq"], "post-gate": ["gtcrn"] },
        },
      ],
    ]);
  });
});

describe("ids from other modules", () => {
  it("work with quotes in them: opening settings, going to the level", () => {
    const odd = effect('a"b]', "send", { label: "Odd" });
    const { card, press, view } = open({
      effects: [odd],
      local: { chosenEffects: ['a"b]'], audioEffectMix: { 'a"b]': 0.5 } },
    });

    press(card('a"b]'), "Enter");
    const pop = view.element.querySelector('[data-pop="settings"]');
    press(card('a"b]'), "l");

    expect(pop).not.toBeNull();
    expect((document.activeElement as HTMLElement).dataset.field).toBe(
      'mix.a"b]',
    );
  });
});

describe("the levels panel", () => {
  it("has a fader per level in the chain's order, then Channel", () => {
    const { view } = open({
      ...CHAIN,
      local: {
        ...CHAIN.local,
        chosenEffects: ["reverb", "echo"],
        audioEffectOrder: { ...NO_ORDER, send: ["echo", "reverb"] },
      },
    });

    const faders = [
      ...view.element.querySelectorAll<HTMLElement>("[data-fader]"),
    ].map((f) => f.dataset.fader);

    expect(faders).toEqual(["echo", "reverb", "channel"]);
  });

  it("sets a level while it is dragged", async () => {
    const { calls, input } = open();
    const fader = input('[data-field="mix.reverb"]');

    fader.value = "55";
    fader.dispatchEvent(new Event("input"));
    await act();

    expect(calls()).toEqual([["setAudioEffectMix", "reverb", 0.55]]);
  });

  it("sets Channel level and Cut tails", async () => {
    const { q, calls, input } = open();
    const channel = input('[data-field="channel"]');

    channel.value = "30";
    channel.dispatchEvent(new Event("input"));
    q('[data-field="cutTails"]').click();
    await act();

    expect(calls()).toEqual([
      ["setAudioChannelLevel", 0.3],
      ["setAudioCutTails", true],
    ]);
  });

  it("follows a level the core changes", async () => {
    const { q, setLocal, input } = open();

    await setLocal({ audioEffectMix: { reverb: 0.8, echo: 0.25 } });

    expect(input('[data-field="mix.reverb"]').value).toBe("80");
    expect(q('[data-field="level.reverb"]').textContent).toBe("80%");
  });
});

describe("an effect's settings", () => {
  it("open from the card's button, with the place, Switch off and Remove", async () => {
    const { q, calls, select } = open({ ...CHAIN, controls: [decay] });

    q('[data-field="settings.reverb"]').click();
    const pop = q('[data-pop="settings"]');
    const place = select('[data-field="place.reverb"]');
    place.value = "post-gate";
    place.dispatchEvent(new Event("change"));
    await act();

    expect(pop.querySelector('[data-control="decay"]')).not.toBeNull();
    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        {
          places: { reverb: "post-gate" },
          order: { send: [], "post-gate": ["reverb"] },
        },
      ],
    ]);
  });

  it("show its own controls only while it is on", async () => {
    const set = vi.fn(() => Promise.resolve());
    const { q, setLocal, view } = open({
      ...CHAIN,
      controls: [{ ...decay, set } as unknown as ControlContribution],
    });

    q('[data-field="settings.eq"]').click();
    const offHint = q('[data-pop="settings"]').textContent;
    q('[data-field="settings.reverb"]').click();
    const decayInput = q('[data-control="decay"] input') as HTMLInputElement;
    decayInput.value = "2";
    decayInput.dispatchEvent(new Event("input"));
    await act();
    await setLocal({
      chosenEffects: ["rnnoise"],
      audioEffectOrder: {
        ...NO_ORDER,
        "pre-gate": ["rnnoise", "eq"],
        send: ["reverb"],
      },
    });

    expect(offHint).toContain("Switch it on");
    expect(set).toHaveBeenCalledWith(2);
    expect(view.element.querySelector('[data-control="decay"]')).toBeNull();
    expect(q('[data-field="power.reverb"]').textContent).toBe("Switch on");
  });

  it("draw toggles and choices, and leave buttons out", async () => {
    const attached = {
      kind: "control",
      place: "quick",
      effect: "reverb",
    } as const;
    const toggleSet = vi.fn(() => Promise.resolve());
    const choiceSet = vi.fn(() => Promise.resolve());
    const { q, view, input, select } = open({
      ...CHAIN,
      controls: [
        {
          ...attached,
          type: "toggle",
          id: "wide",
          label: "Wide",
          state: fixed({ on: false }),
          set: toggleSet,
        },
        {
          ...attached,
          type: "choice",
          id: "room",
          label: "Room",
          options: [
            { value: "hall", label: "Hall" },
            { value: "cave", label: "Cave" },
          ],
          state: fixed("hall"),
          set: choiceSet,
        },
        {
          ...attached,
          type: "button",
          id: "reset",
          label: "Reset",
          run: () => Promise.resolve(),
        },
      ],
    });

    q('[data-field="settings.reverb"]').click();
    input('[data-control="wide"] input').click();
    const room = select('[data-control="room"] select');
    room.value = "cave";
    room.dispatchEvent(new Event("change"));
    await act();

    expect(toggleSet).toHaveBeenCalledWith(true);
    expect(choiceSet).toHaveBeenCalledWith("cave");
    expect(view.element.querySelector('[data-control="reset"]')).toBeNull();
  });

  it("close with Escape, giving focus back to the button", () => {
    const { q, press, view } = open();
    const button = q('[data-field="settings.reverb"]');

    button.click();
    press(q('[data-pop="settings"]'), "Escape");

    expect(view.element.querySelector('[data-pop="settings"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("swap the noise model in the card's slot", async () => {
    const { q, calls, select } = open();

    q(`[data-field="settings.${NOISE_KEY}"]`).click();
    const model = select('[data-field="model"]');
    model.value = "gtcrn";
    model.dispatchEvent(new Event("change"));
    await act();

    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        {
          places: { gtcrn: "pre-gate" },
          order: { "pre-gate": ["gtcrn", "eq"] },
        },
      ],
      ["setEffectEnabled", "gtcrn", true],
    ]);
  });

  it("offer to refuse the layer that holds an effect", async () => {
    const layers = fakeLayers(
      [{ id: "cave", label: "The cave", state: "applied" }],
      { effects: { reverb: { on: true } } },
    );
    const { q } = open(CHAIN, layers);

    q('[data-field="settings.reverb"]').click();
    q('[data-field="refuse.cave"]').click();
    await act();

    expect(layers.refused).toEqual(["cave"]);
  });
});

describe("the effect browser", () => {
  it("opens from a place's +, and adds what is picked at its end, on", async () => {
    const { q, calls } = open();

    q('[data-field="add.send"]').click();
    q('[data-offer="echo"]').click();
    await act();

    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        { places: { echo: "send" }, order: { send: ["reverb", "echo"] } },
      ],
      ["setEffectEnabled", "echo", true],
    ]);
  });

  it("finds by name, and picks with the arrows and Enter", async () => {
    const { q, press, calls, input } = open();

    q('[data-field="add.post-gate"]').click();
    const search = input('[data-field="search"]');
    search.value = "rad";
    search.dispatchEvent(new Event("input"));
    press(search, "ArrowDown");
    press(search, "Enter");
    await act();

    expect(document.activeElement).not.toBe(search);
    expect(calls()).toEqual([
      [
        "setAudioPipeline",
        { places: { radio: "post-gate" }, order: { "post-gate": ["radio"] } },
      ],
      ["setEffectEnabled", "radio", true],
    ]);
  });

  it("puts what was added lately first", async () => {
    const first = open();
    first.q('[data-field="add.post-gate"]').click();
    first.q('[data-offer="radio"]').click();
    await act();

    const again = open();
    again.q('[data-field="add.send"]').click();

    const [top] =
      again.view.element.querySelectorAll<HTMLElement>("[data-offer]");
    expect(top?.dataset.offer).toBe("radio");
  });

  it("leaves out what the call can't run", () => {
    const { q, view } = open({
      ...CHAIN,
      local: {
        ...CHAIN.local,
        effects: { echo: { status: "unavailable", error: null } },
      },
    });

    q('[data-field="add.send"]').click();

    expect(view.element.querySelector('[data-offer="echo"]')).toBeNull();
  });
});
