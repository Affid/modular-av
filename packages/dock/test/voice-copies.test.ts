// @vitest-environment happy-dom
import type { AVState, VoiceCopy } from "@modular-av/api";
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

/** Transcriber on the GM's browser: Player1 allowed it, I haven't answered. */
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

/** Captions on Player1's browser, which I refused. */
const CAPTIONS: VoiceCopy = {
  receiver: "p1",
  moduleId: "captions",
  title: "Captions",
  targets: [{ participant: "me", sources: ["microphone"], consent: "refused" }],
};

const withCopies = (voiceCopies: readonly VoiceCopy[]): AVState =>
  avState({ participants: [me, gm, p1], voiceCopies });

const mineAs = (
  copy: VoiceCopy,
  consent: "allowed" | "refused" | "asking",
): VoiceCopy => ({
  ...copy,
  targets: copy.targets.map((t) =>
    t.participant === "me" ? { ...t, consent } : t,
  ),
});

function mounted(state: AVState) {
  const dock = testDock({ state });
  const host = fakeHost();
  camerasSurface(dock.ctx).mount(host);
  const tile = (id: string): HTMLElement | null =>
    host.element.querySelector(`.mav-dock-tile[data-participant-id="${id}"]`);
  const line = (): HTMLButtonElement | null =>
    host.element.querySelector(".mav-dock-voices");
  const openList = async (): Promise<Element> => {
    line()?.click();
    return vi.waitFor(() => {
      const open = document.querySelector(".mav-dock-voice-copies");
      if (!open) throw new Error("not open yet");
      return open;
    });
  };
  return { ...dock, host, tile, line, openList };
}

const label = (element: Element | null | undefined): string | null =>
  element?.getAttribute("aria-label") ?? null;

const rows = (list: Element): HTMLElement[] => [
  ...list.querySelectorAll<HTMLElement>("[data-voice-copy]"),
];

const pressed = (row: HTMLElement | undefined): (string | null)[] =>
  [...(row?.querySelectorAll(".mav-effect-choice") ?? [])].map((b) =>
    b.getAttribute("aria-pressed"),
  );

describe("a browser whose module receives voices", () => {
  it("has an ear on its player's tile saying who it receives, who refused, who hasn't answered", () => {
    const { tile } = mounted(
      withCopies([
        {
          ...TRANSCRIBER,
          targets: [
            ...TRANSCRIBER.targets,
            { participant: "gm", sources: ["microphone"], consent: "refused" },
          ],
        },
      ]),
    );

    const badge = tile("gm")?.querySelector('[data-indicator="voice-copies"]');

    expect(label(badge)).toBe(
      "Modules here: Transcriber receives Player1 (refused: Gamemaster; not answered: you)",
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
    api.setState((s) => ({
      ...s,
      voiceCopies: [mineAs(CAPTIONS, "allowed")],
    }));
    await settle();
    const changed = label(badge());
    api.setState((s) => ({ ...s, voiceCopies: [] }));
    await settle();

    // Assert
    expect(started).toBe(
      "Modules here: Captions receives no one (refused: you)",
    );
    expect(changed).toBe("Modules here: Captions receives you");
    expect(badge()).toBeNull();
  });

  it("is marked in Foundry's player list, in or out of the call", async () => {
    // Arrange
    const { ctx, api } = testDock({
      state: avState({ participants: [me, { ...gm, connected: false }, p1] }),
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
      "Modules here: Transcriber receives Player1 (not answered: you)",
    );
    expect(
      list.querySelector('[data-user-id="p1"] [data-indicator]'),
    ).toBeNull();
  });
});

describe("the voice panel's line", () => {
  it("shows only while a module asks, and stands out until answered", async () => {
    // Arrange
    const { line, api } = mounted(withCopies([]));
    const hiddenAtFirst = line()?.hidden ?? true;

    // Act
    api.setState((s) => ({ ...s, voiceCopies: [TRANSCRIBER] }));
    await settle();

    // Assert
    expect(hiddenAtFirst).toBe(true);
    expect(line()?.hidden).toBe(false);
    expect(line()?.dataset.state).toBe("asking");
    expect(line()?.querySelector(".mav-dock-voices-title")?.textContent).toBe(
      "Transcriber",
    );
    expect(line()?.textContent).toBe("Transcriber wants your voice");
    expect(label(line())).toBe(
      "Transcriber, on Gamemaster's browser, wants your voice. Open to answer.",
    );
  });

  it("says a module receives the voice, or that the player refused it", () => {
    const allowed = mounted(withCopies([mineAs(TRANSCRIBER, "allowed")]));
    const refused = mounted(withCopies([CAPTIONS]));

    expect(allowed.line()?.textContent).toBe("Transcriber receives your voice");
    expect(refused.line()?.textContent).toBe("You refused Captions");
    expect(refused.line()?.dataset.state).toBe("refused");
    expect(refused.line()?.querySelector("i")?.className).toContain(
      "fa-ear-deaf",
    );
  });

  it("sums several modules up by what is left to do", () => {
    const { line } = mounted(withCopies([TRANSCRIBER, CAPTIONS]));

    expect(line()?.textContent).toBe("Your voice: 1 to answer, 1 refused");
    expect(line()?.dataset.state).toBe("asking");
  });

  it("follows a player's name arriving after the module", async () => {
    const { line, api } = mounted(
      avState({ participants: [me], voiceCopies: [TRANSCRIBER] }),
    );

    api.setState((s) => ({ ...s, participants: { ...s.participants, gm } }));
    await settle();

    expect(label(line())).toContain("on Gamemaster's browser");
  });
});

describe("the list of modules that asked", () => {
  it("lists unanswered modules first, each with where it stands", async () => {
    const { openList } = mounted(withCopies([CAPTIONS, TRANSCRIBER]));

    const list = await openList();
    const [first, second] = rows(list);

    expect(first?.querySelector(".mav-voice-copy-title")?.textContent).toBe(
      "Transcriber",
    );
    expect(first?.querySelector(".mav-voice-copy-status")?.textContent).toBe(
      "Not answered",
    );
    expect(first?.querySelector(".mav-voice-copy-detail")?.textContent).toBe(
      "On Gamemaster's browser. It gets nothing until you answer.",
    );
    expect(pressed(first)).toEqual(["false", "false"]);
    expect(second?.querySelector(".mav-voice-copy-status")?.textContent).toBe(
      "Refused",
    );
    expect(pressed(second)).toEqual(["false", "true"]);
  });

  it("answers with Allow or Refuse, and says so to screen readers", async () => {
    // Arrange
    const { openList, api } = mounted(withCopies([TRANSCRIBER]));
    const list = await openList();
    const [row] = rows(list);
    const [allow, refuse] = [
      ...(row?.querySelectorAll<HTMLButtonElement>(".mav-effect-choice") ?? []),
    ];

    // Act
    refuse?.click();
    await settle();
    api.setState((s) => ({
      ...s,
      voiceCopies: [mineAs(TRANSCRIBER, "refused")],
    }));
    await settle();
    refuse?.click();
    allow?.click();
    await settle();

    // Assert
    expect(api.calls).toEqual([
      { command: "decideVoiceCopy", args: ["transcriber", "gm", false] },
      { command: "decideVoiceCopy", args: ["transcriber", "gm", true] },
    ]);
    expect(list.querySelector('[role="status"]')?.textContent).toBe(
      "Transcriber: allowed. It receives your voice and your screen's sound.",
    );
  });

  it("names each module's group and describes it", async () => {
    const { openList } = mounted(withCopies([TRANSCRIBER]));

    const [row] = rows(await openList());
    const named = row?.getAttribute("aria-labelledby") ?? "";
    const described = (row?.getAttribute("aria-describedby") ?? "").split(" ");

    expect(row?.getAttribute("role")).toBe("group");
    expect(document.getElementById(named)?.textContent).toBe("Transcriber");
    expect(
      described.map((id) => document.getElementById(id)?.textContent),
    ).toEqual([
      "Not answered",
      "On Gamemaster's browser. It gets nothing until you answer.",
    ]);
  });

  it("says what the rest get, and opens the settings to change it", async () => {
    const { openList, opened } = mounted(withCopies([TRANSCRIBER]));

    const list = await openList();
    list.querySelector<HTMLButtonElement>(".mav-voice-footer button")?.click();

    expect(list.querySelector(".mav-voice-footer p")?.textContent).toBe(
      "For modules you haven't answered: Ask me",
    );
    expect(list.querySelector("select")).toBeNull();
    expect(opened.settings).toBe(1);
  });

  it("closes once no module asks any more", async () => {
    const { openList, line, api } = mounted(withCopies([TRANSCRIBER]));
    await openList();

    api.setState((s) => ({ ...s, voiceCopies: [] }));
    await settle();

    expect(document.querySelector(".mav-dock-voice-copies")).toBeNull();
    expect(line()?.hidden).toBe(true);
  });
});

describe("other people's words", () => {
  it("stay text: a module's title never becomes HTML", async () => {
    const title = '<img src="x" onerror="alert(1)">';
    const { tile, line, openList } = mounted(
      withCopies([{ ...TRANSCRIBER, title }]),
    );

    const badge = tile("gm")?.querySelector<HTMLElement>(
      '[data-indicator="voice-copies"]',
    );
    const list = await openList();

    expect(badge?.dataset.tooltipText).toContain(title);
    expect(badge?.dataset.tooltip).toBeUndefined();
    expect(line()?.dataset.tooltip).toBeUndefined();
    expect(line()?.textContent).toContain(title);
    expect(list.querySelector(".mav-voice-copy-title")?.textContent).toBe(
      title,
    );
    expect(document.querySelector("img")).toBeNull();
  });
});
