import type { AudioSource, VoiceConsentChoice } from "@modular-av/api";
import { fakeTrackInfo } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, createTable, micOf, type Tab, USERS } from "./table.ts";

const MODULE = "transcriber";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Each user's consent, saved before the table sits down. */
function table(consent: Readonly<Record<string, VoiceConsentChoice>> = {}) {
  return createTable({
    users: USERS.map((u) =>
      consent[u.id]
        ? {
            ...u,
            flags: {
              "modular-av": {
                voiceConsent: { choice: consent[u.id], decisions: [] },
              },
            },
          }
        : u,
    ),
    modules: [
      { id: "modular-av", version: "0.1.0" },
      { id: MODULE, version: "1.0.0", title: "Transcriber" },
      { id: "captions", version: "1.0.0", title: "Captions" },
    ],
  });
}

async function call(
  consent: Readonly<Record<string, VoiceConsentChoice>> = {},
) {
  const t = table(consent);
  const gm = t.join("gm", { secret: true, av: ALWAYS });
  const p1 = t.join("p1", { av: ALWAYS });
  await t.settle();
  return { table: t, gm, p1 };
}

function listen(
  tab: Tab,
  participant: string,
  source: AudioSource = "microphone",
  moduleId = MODULE,
) {
  const received: (MediaStreamTrack | null)[] = [];
  const off = tab.api.media.audio(moduleId, participant, source, (track) => {
    received.push(track);
  });
  return { received, off };
}

const copied = (track: MediaStreamTrack | null | undefined) =>
  track ? fakeTrackInfo(track).cloneOf : undefined;

const messages = (tab: Tab) => tab.client.notifications.map((n) => n.message);

const openDialogs = (tab: Tab) => tab.client.dialogs.filter((d) => d.open);

describe("what every browser learns", () => {
  it("shows which module receives whose voice, while it is subscribed", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call();

    // Act
    const { off } = listen(gm, "p1");
    await t.settle();

    // Assert
    expect(p1.api.state.get().voiceCopies).toEqual([
      {
        receiver: "gm",
        moduleId: MODULE,
        title: "Transcriber",
        targets: [
          { participant: "p1", sources: ["microphone"], consent: "asking" },
        ],
      },
    ]);
    off();
    await t.settle();
    expect(p1.api.state.get().voiceCopies).toEqual([]);
  });

  it("joins a module's subscriptions into one entry, written once", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call();
    let writes = 0;
    p1.client.Hooks.on("updateUser", (user: { id: string }) => {
      if (user.id === "gm") writes += 1;
    });

    // Act
    listen(gm, "p1");
    listen(gm, "p1", "screen");
    listen(gm, "gm");
    await t.settle();

    // Assert
    expect(writes).toBe(1);
    expect(p1.api.state.get().voiceCopies[0]?.targets).toEqual([
      {
        participant: "p1",
        sources: ["microphone", "screen"],
        consent: "asking",
      },
      { participant: "gm", sources: ["microphone"], consent: "asking" },
    ]);
  });

  it("forgets a browser's modules once its player logs out", async () => {
    const { table: t, gm, p1 } = await call();
    listen(gm, "p1");
    await t.settle();

    gm.client.disconnect();
    await t.settle();

    expect(p1.api.state.get().voiceCopies).toEqual([]);
  });

  it("clears what a closed page left behind when the player comes back", async () => {
    // Arrange
    const t = table();
    t.world.updateUser("gm", {
      flags: {
        "modular-av": {
          voiceCopies: [
            {
              moduleId: MODULE,
              targets: [{ participant: "p1", sources: ["microphone"] }],
            },
          ],
        },
      },
    });

    // Act
    const p1 = t.join("p1", { av: ALWAYS });
    t.join("gm", { secret: true, av: ALWAYS });
    await t.settle();

    // Assert
    expect(p1.api.state.get().voiceCopies).toEqual([]);
  });

  it("ignores what doesn't make sense in another player's flags", async () => {
    // Arrange
    const { table: t, p1 } = await call();

    // Act
    t.world.updateUser("gm", {
      flags: {
        "modular-av": {
          voiceCopies: [
            "junk",
            { moduleId: 3, targets: [] },
            {
              moduleId: "Allow to fix your audio",
              targets: [{ participant: "p1", sources: ["microphone"] }],
            },
            {
              moduleId: MODULE,
              targets: [{ participant: "p1", sources: ["camera"] }],
            },
            {
              moduleId: MODULE,
              targets: [{ participant: "nobody", sources: ["microphone"] }],
            },
          ],
        },
      },
    });
    t.world.updateUser("p1", {
      flags: {
        "modular-av": { voiceConsent: { choice: "always", decisions: "x" } },
      },
    });
    await t.settle();

    // Assert
    expect(p1.api.state.get().voiceCopies).toEqual([]);
    expect(p1.api.state.get().voiceConsent).toEqual({
      choice: "ask",
      decisions: [],
    });
    expect(p1.errors).toEqual([]);
  });
});

describe("asking the player", () => {
  it("hands nothing until they allow it, by default", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await t.settle();
    expect(received).toEqual([]);
    const [dialog] = openDialogs(p1);

    // Act
    dialog?.press("yes");
    await t.settle();

    // Assert
    expect(dialog?.content).toContain("Transcriber, on Gamemaster's browser");
    expect(copied(received[0])).toBe(micOf(p1));
    expect(p1.api.state.get().voiceConsent.decisions).toEqual([
      { moduleId: MODULE, receiver: "gm", allow: true },
    ]);
  });

  it("keeps it from the module when they refuse", async () => {
    const { table: t, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await t.settle();

    openDialogs(p1)[0]?.press("no");
    await t.settle();

    expect(received).toEqual([]);
    expect(gm.api.state.get().voiceCopies[0]?.targets[0]?.consent).toBe(
      "refused",
    );
  });

  it("asks again the next time when they closed the dialog", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call();
    const first = listen(gm, "p1");
    await t.settle();
    openDialogs(p1)[0]?.dismiss();
    await t.settle();

    // Act
    first.off();
    await t.settle();
    listen(gm, "p1");
    await t.settle();

    // Assert
    expect(first.received).toEqual([]);
    expect(p1.client.dialogs).toHaveLength(2);
    expect(openDialogs(p1)).toHaveLength(1);
  });

  it("asks once per module on a browser, not once per subscription", async () => {
    const { table: t, gm, p1 } = await call();

    listen(gm, "p1");
    listen(gm, "p1", "screen");
    await t.settle();
    listen(gm, "p1", "microphone");
    await t.settle();

    expect(p1.client.dialogs).toHaveLength(1);
  });

  it("asks for a module on their own browser too", async () => {
    const { table: t, p1 } = await call();

    listen(p1, "p1", "microphone", "captions");
    await t.settle();

    expect(openDialogs(p1)[0]?.content).toContain("Captions, on your browser");
  });

  it("asks anew for the same module on another player's browser", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call();
    const gm2 = t.join("gm2", { av: ALWAYS });
    await t.settle();
    listen(gm, "p1");
    await t.settle();
    openDialogs(p1)[0]?.press("yes");
    await t.settle();

    // Act
    const { received } = listen(gm2, "p1");
    await t.settle();

    // Assert
    expect(received).toEqual([]);
    expect(openDialogs(p1)[0]?.content).toContain("Gamemaster2's browser");
  });

  it("escapes the module's title and the player's name in the dialog", async () => {
    const t = createTable({
      modules: [
        { id: "modular-av", version: "0.1.0" },
        { id: MODULE, version: "1.0.0", title: "<b>Rec</b>" },
      ],
    });
    const gm = t.join("gm", { secret: true, av: ALWAYS });
    const p1 = t.join("p1", { av: ALWAYS });
    await t.settle();

    listen(gm, "p1");
    await t.settle();

    expect(openDialogs(p1)[0]?.content).toContain("&lt;b&gt;Rec&lt;/b&gt;");
  });
});

describe("the player's choice", () => {
  it("lets modules receive their voice without asking when they allow", async () => {
    const { table: t, gm, p1 } = await call({ p1: "allow" });

    const { received } = listen(gm, "p1");
    await t.settle();

    expect(copied(received[0])).toBe(micOf(p1));
    expect(p1.client.dialogs).toEqual([]);
    expect(messages(p1)).toContain(
      "Transcriber, on Gamemaster's browser, now receives your voice.",
    );
  });

  it("keeps their voice from every module when they refuse, and says it asked", async () => {
    const { table: t, gm, p1 } = await call({ p1: "refuse" });

    const { received } = listen(gm, "p1");
    await t.settle();

    expect(received).toEqual([]);
    expect(p1.client.dialogs).toEqual([]);
    expect(messages(p1)).toContain(
      "Transcriber, on Gamemaster's browser, asked for your voice. It gets nothing: you refused.",
    );
  });

  it("follows a remembered answer over the choice", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call({ p1: "allow" });
    const { received } = listen(gm, "p1");
    await t.settle();

    // Act
    await p1.api.commands.decideVoiceCopy(MODULE, "gm", false);
    await t.settle();

    // Assert
    expect(received).toHaveLength(2);
    expect(received[1]).toBeNull();
  });

  it("asks again for a running module once its answers are forgotten", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await t.settle();
    openDialogs(p1)[0]?.press("yes");
    await t.settle();

    // Act
    await p1.api.commands.forgetVoiceDecisions();
    await t.settle();

    // Assert
    expect(received.at(-1)).toBeNull();
    expect(openDialogs(p1)).toHaveLength(1);
    expect(p1.api.state.get().voiceConsent.decisions).toEqual([]);
  });

  it("saves the choice for the other browsers to read", async () => {
    const { table: t, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await t.settle();

    await p1.api.commands.setVoiceConsent("allow");
    await t.settle();

    expect(p1.api.state.get().voiceConsent.choice).toBe("allow");
    expect(copied(received[0])).toBe(micOf(p1));
  });

  it("keeps both of two answers given at once", async () => {
    const { table: t, p1 } = await call();

    await Promise.all([
      p1.api.commands.decideVoiceCopy(MODULE, "gm", true),
      p1.api.commands.decideVoiceCopy("captions", "gm", false),
    ]);
    await t.settle();

    expect(p1.api.state.get().voiceConsent.decisions).toEqual([
      { moduleId: MODULE, receiver: "gm", allow: true },
      { moduleId: "captions", receiver: "gm", allow: false },
    ]);
  });

  it("refuses a choice, a receiver or a module that doesn't exist", async () => {
    const { p1 } = await call();
    const { commands } = p1.api;

    await expect(
      commands.setVoiceConsent("always" as VoiceConsentChoice),
    ).rejects.toThrow(/choice/i);
    await expect(
      commands.decideVoiceCopy(MODULE, "nobody", true),
    ).rejects.toThrow(/player/i);
    await expect(commands.decideVoiceCopy("", "gm", true)).rejects.toThrow(
      /module/i,
    );
  });
});

describe("telling the player", () => {
  it("tells them each time a module starts receiving their voice", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call({ p1: "allow" });
    const first = listen(gm, "p1");
    await t.settle();

    // Act
    first.off();
    await t.settle();
    listen(gm, "p1");
    await t.settle();

    // Assert
    expect(
      messages(p1).filter((m) => m.includes("now receives your voice")),
    ).toHaveLength(2);
  });

  it("says so when a module adds their screen's sound", async () => {
    const { table: t, gm, p1 } = await call({ p1: "allow" });
    listen(gm, "p1");
    await t.settle();

    listen(gm, "p1", "screen");
    await t.settle();

    expect(messages(p1)).toContain(
      "Transcriber, on Gamemaster's browser, now also receives your screen's sound.",
    );
  });

  it("says nothing new when a module takes its subscription again at once", async () => {
    const { table: t, gm, p1 } = await call({ p1: "allow" });
    const first = listen(gm, "p1");
    await t.settle();
    const before = messages(p1).length;

    first.off();
    listen(gm, "p1");
    await t.settle();

    expect(messages(p1)).toHaveLength(before);
  });
});

describe("the settings", () => {
  it("offers the choice and forgetting the answers from Foundry's settings", async () => {
    // Arrange
    const { table: t, p1 } = await call();
    const menu = p1.client.game.settings.menus.get("modular-av.voices");
    const Menu = menu?.type as (new () => { render(): unknown }) | undefined;

    // Act
    if (Menu) void new Menu().render();
    await t.settle();
    openDialogs(p1)[0]?.press("allow");
    await t.settle();

    // Assert
    expect(menu?.restricted).toBe(false);
    expect(p1.client.dialogs[0]?.actions).toEqual([
      "allow",
      "ask",
      "refuse",
      "forget",
    ]);
    expect(p1.api.state.get().voiceConsent.choice).toBe("allow");
  });

  it("forgets the answers only once the player confirms, told what follows", async () => {
    // Arrange
    const { table: t, gm, p1 } = await call({ p1: "allow" });
    await p1.api.commands.decideVoiceCopy(MODULE, "gm", false);
    const { received } = listen(gm, "p1");
    await t.settle();
    const section = p1.api.contributions
      .list()
      .find((c) => c.id === "modular-av.voices");
    const controls =
      section?.kind === "settings-section" ? section.controls : [];
    const forget = controls?.find((c) => c.type === "button");

    // Act
    if (forget?.type === "button") void forget.run();
    await t.settle();
    const [confirm] = openDialogs(p1);
    const warned = confirm?.content ?? "";
    confirm?.press("no");
    await t.settle();
    const keptAfterCancel = p1.api.state.get().voiceConsent.decisions.length;
    if (forget?.type === "button") void forget.run();
    await t.settle();
    openDialogs(p1)[0]?.press("yes");
    await t.settle();

    // Assert
    expect(warned).toContain("including those you refused");
    expect(keptAfterCancel).toBe(1);
    expect(p1.api.state.get().voiceConsent.decisions).toEqual([]);
    expect(copied(received.at(-1))).toBe(micOf(p1));
  });

  it("asks the core-only player to confirm forgetting from the menu too", async () => {
    const { table: t, p1 } = await call();
    await p1.api.commands.decideVoiceCopy(MODULE, "gm", true);
    const menu = p1.client.game.settings.menus.get("modular-av.voices");
    const Menu = menu?.type as (new () => { render(): unknown }) | undefined;

    if (Menu) void new Menu().render();
    await t.settle();
    openDialogs(p1)[0]?.press("forget");
    await t.settle();
    openDialogs(p1)[0]?.press("yes");
    await t.settle();

    expect(p1.client.dialogs[1]?.content).toContain("will ask you again");
    expect(p1.api.state.get().voiceConsent.decisions).toEqual([]);
  });

  it("puts the same in a settings window's Call tab", async () => {
    // Arrange
    const { table: t, p1 } = await call();
    const section = p1.api.contributions
      .list()
      .find((c) => c.id === "modular-av.voices");
    const [choice] =
      section?.kind === "settings-section" ? (section.controls ?? []) : [];

    // Act
    if (choice?.type === "choice") await choice.set("refuse");
    await t.settle();

    // Assert
    expect(section).toMatchObject({ kind: "settings-section", tab: "call" });
    expect(choice?.type === "choice" && choice.state.get()).toBe("refuse");
  });
});
