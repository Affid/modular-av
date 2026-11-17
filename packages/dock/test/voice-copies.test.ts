// @vitest-environment happy-dom
import type { AVState, Contribution, VoiceCopy } from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { playersSurface } from "../src/players/decorate.ts";
import { fakeHost, settle, testDock } from "./context.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });
const gm = participantState({ id: "gm", name: "Gamemaster" });
const p1 = participantState({ id: "p1", name: "Player1" });

/** Transcriber on the GM's browser, asking for Player1's voice and mine. */
const TRANSCRIBER: VoiceCopy = {
  receiver: "gm",
  moduleId: "transcriber",
  title: "Transcriber",
  targets: [
    { participant: "p1", sources: ["microphone"], consent: "allowed" },
    {
      participant: "me",
      sources: ["microphone", "screen"],
      consent: "asking",
    },
  ],
};

const CAPTIONS: VoiceCopy = {
  receiver: "p1",
  moduleId: "captions",
  title: "Captions",
  targets: [{ participant: "me", sources: ["microphone"], consent: "refused" }],
};

const withCopies = (voiceCopies: readonly VoiceCopy[]): AVState =>
  avState({ participants: [me, gm, p1], voiceCopies });

function mounted(state: AVState, contributions: readonly Contribution[] = []) {
  const dock = testDock({ state });
  for (const c of contributions) dock.api.contributions.register(c);
  const host = fakeHost();
  camerasSurface(dock.ctx).mount(host);
  const tile = (id: string): HTMLElement | null =>
    host.element.querySelector(`.mav-dock-tile[data-participant-id="${id}"]`);
  const voices = (): HTMLButtonElement | null =>
    host.element.querySelector(".mav-dock-voices");
  return { ...dock, host, tile, voices };
}

const label = (element: Element | null | undefined): string | null =>
  element?.getAttribute("aria-label") ?? null;

describe("a browser whose module receives voices", () => {
  it("has a badge on its player's tile saying whose voices and where they stand", () => {
    const { tile } = mounted(withCopies([TRANSCRIBER]));

    const badge = tile("gm")?.querySelector('[data-indicator="voice-copies"]');

    expect(label(badge)).toBe(
      "Voices for modules here: Transcriber (Player1, Me waiting)",
    );
    expect(badge?.querySelector("i")?.className).toContain("fa-ear-listen");
    expect(
      tile("p1")?.querySelector('[data-indicator="voice-copies"]'),
    ).toBeNull();
  });

  it("follows the modules as they start, change and stop", async () => {
    // Arrange
    const { tile, api } = mounted(withCopies([]));
    const badge = () =>
      tile("p1")?.querySelector('[data-indicator="voice-copies"]') ?? null;

    // Act
    api.setState((s) => ({ ...s, voiceCopies: [CAPTIONS] }));
    await settle();
    const started = label(badge());
    api.setState((s) => ({ ...s, voiceCopies: [] }));
    await settle();

    // Assert
    expect(started).toBe("Voices for modules here: Captions (Me declined)");
    expect(badge()).toBeNull();
  });

  it("is marked in Foundry's player list, in or out of the call", async () => {
    // Arrange
    const { ctx, api } = testDock({
      state: avState({
        participants: [me, { ...gm, connected: false }, p1],
      }),
    });
    const list = document.createElement("ol");
    list.innerHTML =
      '<li data-user-id="gm">GM</li><li data-user-id="p1">P1</li>';
    document.body.append(list);
    playersSurface(ctx).decorate(list);

    // Act
    api.setState((s) => ({ ...s, voiceCopies: [TRANSCRIBER] }));
    await settle();

    // Assert
    const badge = list.querySelector(
      '[data-user-id="gm"] [data-indicator="voice-copies"]',
    );
    expect(label(badge)).toBe(
      "Voices for modules here: Transcriber (Player1, Me waiting)",
    );
    expect(
      list.querySelector('[data-user-id="p1"] [data-indicator]'),
    ).toBeNull();
  });
});

describe('the voice panel\'s "your voice" button', () => {
  it("shows only while a module asks for the player's voice", async () => {
    const { voices, api } = mounted(withCopies([]));
    expect(voices()?.hidden ?? true).toBe(true);

    api.setState((s) => ({ ...s, voiceCopies: [TRANSCRIBER] }));
    await settle();

    expect(voices()?.hidden).toBe(false);
    expect(label(voices())).toBe(
      "Transcriber (Gamemaster) asks for your voice",
    );
  });

  it("says how many modules asked when there are several", () => {
    const { voices } = mounted(withCopies([TRANSCRIBER, CAPTIONS]));

    expect(label(voices())).toBe("2 modules asked for your voice");
  });

  it("names a module that receives the voice, and one that was refused", () => {
    const allowed = mounted(
      withCopies([
        {
          ...CAPTIONS,
          targets: [
            { participant: "me", sources: ["microphone"], consent: "allowed" },
          ],
        },
      ]),
    );
    const refused = mounted(withCopies([CAPTIONS]));

    expect(label(allowed.voices())).toBe(
      "Captions (Player1) receives your voice",
    );
    expect(label(refused.voices())).toBe(
      "Captions (Player1) asked for your voice; you refused",
    );
  });

  it("lists each module with a switch that answers for it", async () => {
    // Arrange
    const { voices, api } = mounted(withCopies([TRANSCRIBER, CAPTIONS]));

    // Act
    voices()?.click();
    const popover = await vi.waitFor(() => {
      const open = document.querySelector(".mav-dock-voice-copies");
      if (!open) throw new Error("not open yet");
      return open;
    });
    const items = [
      ...popover.querySelectorAll<HTMLElement>("[data-voice-copy]"),
    ];
    const switches = items.map((i) =>
      i.querySelector<HTMLButtonElement>('[role="switch"]'),
    );
    switches[0]?.click();
    switches[1]?.click();
    await settle();

    // Assert
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining(
        "Transcriber, on Gamemaster's browser: your voice and your screen's sound",
      ),
      expect.stringContaining("Captions, on Player1's browser: your voice"),
    ]);
    expect(items[0]?.textContent).toContain("Waiting for your answer");
    expect(switches.map((s) => s?.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
    ]);
    expect(api.calls).toEqual([
      { command: "decideVoiceCopy", args: ["transcriber", "gm", true] },
      { command: "decideVoiceCopy", args: ["captions", "p1", true] },
    ]);
  });

  it('shows the core\'s choice and "forget my answers" with the list', async () => {
    const forgotten: string[] = [];
    const section: Contribution = {
      kind: "settings-section",
      id: "modular-av.voices",
      label: "Voices for modules",
      settings: [],
      controls: [
        {
          type: "button",
          id: "modular-av.voices.forget",
          label: "Forget my answers",
          run: () => {
            forgotten.push("all");
            return Promise.resolve();
          },
        },
      ],
    };
    const { voices } = mounted(withCopies([TRANSCRIBER]), [section]);

    voices()?.click();
    await vi.waitFor(() => {
      if (!document.querySelector(".mav-dock-voice-copies"))
        throw new Error("not open yet");
    });
    document
      .querySelector<HTMLButtonElement>(
        '.mav-dock-voice-copies [data-control="button"] button',
      )
      ?.click();
    await settle();

    expect(forgotten).toEqual(["all"]);
  });

  it("closes the list once no module asks any more", async () => {
    // Arrange
    const { voices, api } = mounted(withCopies([TRANSCRIBER]));
    voices()?.click();
    await vi.waitFor(() => {
      if (!document.querySelector(".mav-dock-voice-copies"))
        throw new Error("not open yet");
    });

    // Act
    api.setState((s) => ({ ...s, voiceCopies: [] }));
    await settle();

    // Assert
    expect(document.querySelector(".mav-dock-voice-copies")).toBeNull();
    expect(voices()?.hidden).toBe(true);
  });

  it("refuses a module still waiting, and names each module's group", async () => {
    // Arrange
    const { voices, api } = mounted(withCopies([TRANSCRIBER, CAPTIONS]));
    voices()?.click();
    const popover = await vi.waitFor(() => {
      const open = document.querySelector(".mav-dock-voice-copies");
      if (!open) throw new Error("not open yet");
      return open;
    });
    const [waiting, refused] = [
      ...popover.querySelectorAll<HTMLElement>("[data-voice-copy]"),
    ];

    // Act
    waiting?.querySelector<HTMLButtonElement>(".mav-voice-refuse")?.click();
    await settle();

    // Assert
    expect(api.calls).toEqual([
      { command: "decideVoiceCopy", args: ["transcriber", "gm", false] },
    ]);
    expect(
      refused?.querySelector<HTMLElement>(".mav-voice-refuse")?.hidden,
    ).toBe(true);
    const named = waiting?.getAttribute("aria-labelledby") ?? "";
    expect(waiting?.getAttribute("role")).toBe("group");
    expect(document.getElementById(named)?.textContent).toContain(
      "Transcriber, on Gamemaster's browser",
    );
  });
});

describe("other people's words", () => {
  it("stay text: a module's title never becomes HTML", () => {
    const title = '<img src="x" onerror="alert(1)">';
    const { tile, voices } = mounted(withCopies([{ ...TRANSCRIBER, title }]));

    const badge = tile("gm")?.querySelector<HTMLElement>(
      '[data-indicator="voice-copies"]',
    );

    expect(badge?.dataset.tooltipText).toContain(title);
    expect(badge?.dataset.tooltip).toBeUndefined();
    expect(voices()?.dataset.tooltip).toBeUndefined();
    expect(voices()?.textContent).toContain(title);
    expect(document.querySelector("img")).toBeNull();
  });

  it("follows a player's name arriving after the module", async () => {
    const { voices, api } = mounted(
      avState({ participants: [me], voiceCopies: [TRANSCRIBER] }),
    );

    api.setState((s) => ({
      ...s,
      participants: { ...s.participants, gm },
    }));
    await settle();

    expect(voices()?.getAttribute("aria-label")).toBe(
      "Transcriber (Gamemaster) asks for your voice",
    );
  });
});
